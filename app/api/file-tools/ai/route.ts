import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';

export const runtime = 'nodejs';

type AiPdfToolId = 'contract_summary' | 'explain_document' | 'translate_summary' | 'pdf_podcast';

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_PROMPT_LENGTH = 3000;
const DEFAULT_TEXT_MODEL = 'gemini-3.6-flash';

const toolInstructions: Record<AiPdfToolId, string> = {
  contract_summary:
    'Summarize this contract in a practical way. Include key points, obligations, risks, unclear clauses, dates, money terms, renewal/cancellation points, and next actions. Use clear headings and plain language.',
  explain_document:
    'Explain this document simply for a beginner. Avoid legal/technical jargon where possible. Include what it is, why it matters, main points, and what the reader should do next.',
  translate_summary:
    'Translate the full readable PDF into the user-requested language. Preserve the original section order, headings, names, dates, numbers, tables where readable, and obligations. Do not replace the translation with an explanation or summary. Add a very short summary only after the full translation if the user explicitly asks for it.',
  pdf_podcast:
    'Turn this PDF into a natural radio podcast script only. Create a hosted intro, clear segments based on the actual document, transitions, practical takeaways, and a short sign-off. Do not mention model names, duration, voice settings, or implementation details.'
};

function isPdfFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && (value.type === 'application/pdf' || value.name.toLowerCase().endsWith('.pdf'));
}

function readToolId(value: FormDataEntryValue | null): AiPdfToolId | null {
  if (typeof value !== 'string') return null;
  if (value in toolInstructions) return value as AiPdfToolId;
  return null;
}

function extractInteractionText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;

  if (typeof record.output_text === 'string') return record.output_text.trim();
  if (typeof record.outputText === 'string') return record.outputText.trim();

  const steps = Array.isArray(record.steps) ? record.steps : [];
  for (const step of [...steps].reverse()) {
    if (!step || typeof step !== 'object') continue;
    const content = (step as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    const text = content
      .map((block) => (block && typeof block === 'object' ? ((block as { text?: unknown }).text ?? '') : ''))
      .filter((part) => typeof part === 'string')
      .join('')
      .trim();
    if (text) return text;
  }

  const candidates = record.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  return candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';
}

async function getPageCount(buffer: Buffer) {
  try {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

function createLocalDocumentResult(toolId: AiPdfToolId, fileName: string, pageCount: number | null, prompt: string) {
  const pages = pageCount ? `${pageCount} page${pageCount === 1 ? '' : 's'}` : 'PDF pages';

  if (toolId === 'pdf_podcast') {
    return `Podcast script ready for: ${fileName}

Intro
Welcome back to SAVI Radio. Today we are turning ${pages} from this document into a clear and useful audio segment.

Segment 1: What this document is about
The host introduces the document, explains the context in simple language, and tells listeners why it matters.

Segment 2: Important points
The host walks through the strongest takeaways, decisions, responsibilities, and any details that deserve attention.

Segment 3: Practical recap
The episode closes with a short recap and practical next steps the listener can take after reviewing the document.

Instruction used:
${prompt}

Preview note:
Live document reading can be connected when SAVI goes online.`;
  }

  if (toolId === 'contract_summary') {
    return `Contract summary ready for: ${fileName}

Document size
- ${pages}

Key points
- SAVI will identify the parties, dates, responsibilities, deliverables, payments, renewal terms, and cancellation terms.
- Important clauses will be grouped so they are easy to review.

Risks to check
- Broad liability, unclear obligations, automatic renewal, penalties, unusual deadlines, or missing definitions.

Next actions
1. Review the marked risks.
2. Ask for clarification on unclear clauses.
3. Save the final notes before signing or sending for legal review.

Instruction used:
${prompt}

Preview note:
Live document reading can be connected when SAVI goes online.`;
  }

  if (toolId === 'translate_summary') {
    return `Translation and summary ready for: ${fileName}

Document size
- ${pages}

Translated summary
- SAVI will translate the important content, preserve names, dates, numbers, and obligations, then create a short summary.

Key takeaways
1. Main topic.
2. Important details.
3. Recommended next action.

Instruction used:
${prompt}

Preview note:
Live document reading can be connected when SAVI goes online.`;
  }

  return `Simple explanation ready for: ${fileName}

Document size
- ${pages}

What this document is saying
- SAVI will explain the document in simple everyday language.
- Complicated wording will be broken into short points.
- Important ideas will be separated from less important details.

Main ideas
1. What the document is about.
2. Why it matters.
3. What the reader should do next.

Instruction used:
${prompt}

Preview note:
Live document reading can be connected when SAVI goes online.`;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    const toolId = readToolId(form.get('toolId'));
    const prompt = typeof form.get('prompt') === 'string' ? String(form.get('prompt')).trim() : '';

    if (!toolId) {
      return NextResponse.json({ error: 'Choose a valid AI document tool.' }, { status: 400 });
    }

    if (!isPdfFile(file)) {
      return NextResponse.json({ error: 'Upload a PDF first.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'This PDF is too large for AI processing right now. Use a file under 25MB.' }, { status: 413 });
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ error: `Instruction is too long. Limit it to ${MAX_PROMPT_LENGTH} characters for now.` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const pageCount = await getPageCount(buffer);
    const finalPrompt = prompt || toolInstructions[toolId];
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        result: createLocalDocumentResult(toolId, file.name, pageCount, finalPrompt),
        mode: 'local-preview'
      });
    }

    const systemInstruction = [
      'You are SAVI, Smart Assistant for Valuable Ideas by SKH.GLOBAL.',
      'You process the PDF that is attached to this request.',
      'Be helpful, clear, practical, concise, and honest.',
      'If the PDF is scanned or unreadable, say that OCR is needed instead of inventing content.',
      'Do not mention backend implementation, API keys, Firebase, Stripe, model names, or code.'
    ].join('\n');

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        model: process.env.GEMINI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
        system_instruction: systemInstruction,
        input: [
          {
            type: 'text',
            text: [
              toolInstructions[toolId],
              '',
              'User instruction:',
              finalPrompt,
              '',
              `File name: ${file.name}`,
              pageCount ? `Detected pages: ${pageCount}` : ''
            ]
              .filter(Boolean)
              .join('\n')
          },
          {
            type: 'document',
            mime_type: 'application/pdf',
            data: buffer.toString('base64')
          }
        ],
        generation_config: {
          thinking_level: 'low'
        }
      })
    });

    const data = (await response.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || 'Gemini could not process this PDF.' }, { status: response.status });
    }

    const result = extractInteractionText(data);
    if (!result) {
      return NextResponse.json({ error: 'Gemini returned no document result.' }, { status: 502 });
    }

    return NextResponse.json({
      result,
      mode: 'gemini'
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'AI document processing failed.' },
      { status: 500 }
    );
  }
}
