'use client';

import { useEffect, useState } from 'react';

type PreviewKind = 'compare' | 'gallery' | 'audio' | 'video' | 'pdf' | 'script';

type PreviewConfig = {
  kind: PreviewKind;
  title: string;
  caption: string;
  before?: string;
  after?: string;
  media?: string;
  slides?: Array<{ label: string; src?: string; text?: string }>;
};

const previewMap: Record<string, PreviewConfig> = {
  text_to_image: {
    kind: 'video',
    title: 'Text to image',
    caption: 'Prompt becomes a polished visual.',
    media: '/previews/text-to-image-preview.mp4'
  },
  story_sketch: {
    kind: 'video',
    title: 'Story Sketch',
    caption: 'Build a visual sequence shot by shot.',
    media: '/previews/story-sketch-image-preview.mp4'
  },
  sketch_to_image: {
    kind: 'compare',
    title: 'Sketch to image',
    caption: 'Draw a rough idea and turn it into a polished visual.',
    before: '/previews/sketch-to-image-before.png',
    after: '/previews/sketch-to-image-after.png'
  },
  instagram_post: {
    kind: 'video',
    title: 'Instagram post',
    caption: 'Image turns into a post-ready hook, caption, hashtags.',
    media: '/previews/image-to-instagram-post-preview.mp4'
  },
  product_prompt: {
    kind: 'video',
    title: 'Product prompt',
    caption: 'A product idea becomes a premium photo prompt.',
    media: '/previews/prompt-to-product-preview.mp4'
  },
  edit_image: {
    kind: 'compare',
    title: 'Edit image',
    caption: 'Change the scene while preserving identity.',
    before: '/previews/cafe-before.jpg',
    after: '/previews/action-after.jpg'
  },
  remove_background: {
    kind: 'compare',
    title: 'Change background',
    caption: 'Keep the subject, replace the environment.',
    before: '/previews/portrait-before.jpeg',
    after: '/previews/cafe-before.jpg'
  },
  remove_object: {
    kind: 'compare',
    title: 'Remove object',
    caption: 'Remove one element and rebuild naturally.',
    before: '/previews/remove-object-before.jpg',
    after: '/previews/remove-object-after.jpg'
  },
  change_style: {
    kind: 'compare',
    title: 'Change outfit or style',
    caption: 'Preserve face and pose, change styling.',
    before: '/previews/cafe-before.jpg',
    after: '/previews/outfit-after.jpg'
  },
  product_photo: {
    kind: 'video',
    title: 'Product photo',
    caption: 'Reference becomes a clean campaign image.',
    media: '/previews/product-photo-preview.mp4'
  },
  mockup: {
    kind: 'video',
    title: 'Mockup',
    caption: 'A design becomes a product-ready scene.',
    media: '/previews/mockup-preview.mp4'
  },
  visual_mixer: {
    kind: 'video',
    title: 'Visual mixer',
    caption: 'Subject, scene, and style become one image.',
    media: '/previews/visual-mixer-preview.mp4'
  },
  text_design: {
    kind: 'gallery',
    title: 'Poster design',
    caption: 'Readable text and visual hierarchy.',
    slides: [
      { label: 'Launch poster prompt', text: 'Design a premium SAVI launch poster with the headline “Ask. Create. Organise.”, dark glass UI, purple-blue glow, clean spacing.' },
      { label: 'Design', src: '/previews/comic-output.jpg' }
    ]
  },
  variations: {
    kind: 'video',
    title: 'Create variation',
    caption: 'One direction becomes a polished alternative.',
    media: '/previews/create-variations-preview.mp4'
  },
  merge: {
    kind: 'pdf',
    title: 'Merge PDF',
    caption: 'Reorder files, export one clean PDF.',
    slides: [
      { label: 'File A' },
      { label: 'File B' },
      { label: 'Merged' }
    ]
  },
  organize: {
    kind: 'pdf',
    title: 'Organize pages',
    caption: 'Drag, rotate, remove, export.',
    slides: [
      { label: 'Page 1' },
      { label: 'Page 3' },
      { label: 'Page 2' }
    ]
  },
  jpg: {
    kind: 'pdf',
    title: 'PDF to JPG',
    caption: 'Select pages, download a ZIP.',
    slides: [
      { label: 'PDF' },
      { label: 'JPG 01' },
      { label: 'ZIP' }
    ]
  },
  extract_images: {
    kind: 'pdf',
    title: 'Extract PDF images',
    caption: 'Keep original embedded images in one ZIP.',
    slides: [
      { label: 'PDF' },
      { label: 'Images' },
      { label: 'ZIP' }
    ]
  },
  contract_summary: {
    kind: 'script',
    title: 'Contract summary',
    caption: 'Risks, obligations, dates, next actions.',
    slides: [
      { label: 'Contract', src: '/previews/contract-sample.svg' },
      { label: 'Summary', text: 'Payment due in 14 days. Renewal is automatic. Main risk: broad cancellation fee.\nNext: Check renewal, liability, and cancellation terms before signing.' }
    ]
  },
  explain_document: {
    kind: 'script',
    title: 'Simple explanation',
    caption: 'Complicated PDF becomes beginner notes.',
    slides: [
      { label: 'Document', src: '/previews/document-sample.svg' },
      { label: 'Simple summary', text: 'This report says demand is rising, but the team needs clearer pricing and launch dates.\nIn plain words: people like the idea, but the offer needs to be clearer.' }
    ]
  },
  translate_summary: {
    kind: 'script',
    title: 'Translate and summarize',
    caption: 'Translate key points and preserve details.',
    slides: [
      { label: 'Source document', text: 'Lease agreement in French with renewal terms, payment dates, and cancellation clauses.' },
      { label: 'Translated summary', text: 'Monthly rent is due on the 1st. The contract renews automatically. Cancellation requires 30 days written notice.' }
    ]
  },
  pdf_podcast: {
    kind: 'audio',
    title: 'PDF to podcast',
    caption: 'Document becomes a radio script and audio.',
    media: '/previews/radio-sample.wav'
  },
  voice_tts: {
    kind: 'audio',
    title: 'Text to speech',
    caption: 'Choose voice and tone, download WAV.',
    media: '/previews/radio-sample.wav'
  },
  voice_radio: {
    kind: 'audio',
    title: 'Radio Talk AI',
    caption: 'Topic becomes a hosted radio segment.',
    media: '/previews/radio-sample.wav'
  },
  text_video: {
    kind: 'video',
    title: 'Text to video',
    caption: 'Prompt becomes a playable MP4.',
    media: '/previews/text-to-video-preview.mp4'
  },
  story_video: {
    kind: 'video',
    title: 'Story Sketch Video',
    caption: 'Plan a video sequence and generate it shot by shot.',
    media: '/previews/story-sketch-video-preview.mp4'
  },
  image_video: {
    kind: 'video',
    title: 'Image to video',
    caption: 'Reference image becomes motion.',
    media: '/previews/image-to-video-preview.mp4'
  },
  first_last: {
    kind: 'video',
    title: 'Start and end frame',
    caption: 'Guide the transition between frames.',
    media: '/previews/start-end-frame-preview.mp4'
  },
  product_ad: {
    kind: 'video',
    title: 'Product ad video',
    caption: 'Reference product becomes a short ad.',
    media: '/previews/product-ad-video-preview.mp4'
  },
  social_reel: {
    kind: 'video',
    title: 'Social reel',
    caption: 'Vertical reel with fast visual beats.',
    media: '/previews/espresso-video.mp4'
  },
  extend: {
    kind: 'video',
    title: 'Extend video',
    caption: 'Continue motion from a reference clip.',
    media: '/previews/extend-video-preview.mov'
  },
  'pdf-to-podcast': {
    kind: 'audio',
    title: 'PDF to podcast',
    caption: 'Document becomes playable audio.',
    media: '/previews/radio-sample.wav'
  },
  'summarize-contract': {
    kind: 'script',
    title: 'Contract summary',
    caption: 'Risks and obligations in plain language.',
    slides: [
      { label: 'Contract', src: '/previews/contract-sample.svg' },
      { label: 'Summary', text: 'Payment due in 14 days. Renewal is automatic. Main risk: broad cancellation fee.\nNext: Check renewal, liability, and cancellation terms before signing.' }
    ]
  },
  'explain-document': {
    kind: 'script',
    title: 'Explain document',
    caption: 'Dense text becomes simple notes.',
    slides: [
      { label: 'Document', src: '/previews/document-sample.svg' },
      { label: 'Simple summary', text: 'This report says demand is rising, but the team needs clearer pricing and launch dates.\nIn plain words: people like the idea, but the offer needs to be clearer.' }
    ]
  },
  'notes-to-presentation': {
    kind: 'script',
    title: 'Presentation script',
    caption: 'Notes become a slide-by-slide talk track.',
    slides: [
      { label: 'Notes', src: '/previews/notes-sample.svg' },
      { label: 'Presentation script', text: 'Slide 1: Problem\nSlide 2: SAVI solution\nSlide 3: Live demo\nClose: invite the audience to try it.' }
    ]
  },
  'instagram-from-image': {
    kind: 'video',
    title: 'Instagram from image',
    caption: 'Image becomes caption and content angle.',
    media: '/previews/image-to-instagram-post-preview.mp4'
  },
  'product-photo-prompt': {
    kind: 'video',
    title: 'Product prompt',
    caption: 'Idea becomes a ready photo prompt.',
    media: '/previews/prompt-to-product-preview.mp4'
  },
  'blog-to-audio': {
    kind: 'audio',
    title: 'Blog to audio',
    caption: 'Text becomes a downloadable voice file.',
    media: '/previews/radio-sample.wav'
  },
  'translate-pdf': {
    kind: 'script',
    title: 'Translate PDF',
    caption: 'Translation plus a clean summary.',
    slides: [
      { label: 'Spanish invoice PDF', text: 'Factura with payment deadline, service details, tax line, and customer notes.' },
      { label: 'English summary', text: 'Payment due: 12 August. Total: €420. Services: brand consultation and content planning. No late fee listed.' }
    ]
  },
  'professional-text': {
    kind: 'script',
    title: 'Professional rewrite',
    caption: 'Rough text becomes polished.',
    slides: [
      { label: 'Before', text: 'hey can u send this today? we need it fast' },
      { label: 'After', text: 'Hi, could you please send this today if possible? We need it for the next production step. Thank you.' }
    ]
  },
};

export function ToolPreview({ previewId, compact = false }: { previewId: string; compact?: boolean }) {
  const config = previewMap[previewId] ?? previewMap.text_to_image;

  if (compact) return <CompactPreview config={config} />;

  return (
    <div className="rounded-[26px] border border-violet-100 bg-white/65 p-3 shadow-[0_18px_55px_rgba(124,58,237,0.09)]">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-500">Example preview</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{config.title}</h3>
        </div>
        <p className="max-w-[220px] text-right text-xs font-bold leading-5 text-slate-500">{config.caption}</p>
      </div>
      <PreviewBody config={config} compact={false} />
    </div>
  );
}

function CompactPreview({ config }: { config: PreviewConfig }) {
  return (
    <div className="mt-3 overflow-hidden rounded-[14px] border border-violet-100 bg-white/70">
      <PreviewBody config={config} compact />
    </div>
  );
}

function PreviewBody({ config, compact }: { config: PreviewConfig; compact: boolean }) {
  if (config.kind === 'compare' && config.before && config.after) {
    return compact ? <AnimatedCompare before={config.before} after={config.after} /> : <BeforeAfter before={config.before} after={config.after} />;
  }

  if (config.kind === 'video' && config.media) {
    return (
      <div className={`relative mx-auto aspect-video w-full overflow-hidden bg-slate-950 ${compact ? 'max-h-[118px]' : 'max-w-3xl rounded-[20px]'}`}>
        <video src={config.media} muted loop playsInline autoPlay preload="auto" className="h-full w-full object-cover" />
      </div>
    );
  }

  if (config.kind === 'audio') {
    return <AudioPreview compact={compact} media={config.media} />;
  }

  if (config.kind === 'pdf') {
    return <PdfPreview compact={compact} slides={config.slides || []} />;
  }

  return <SlidePreview compact={compact} slides={config.slides || []} />;
}

function AnimatedCompare({ before, after }: { before: string; after: string }) {
  return (
    <div className="relative aspect-[16/9] overflow-hidden bg-slate-100">
      <img src={before} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="savi-compare-reveal absolute inset-0 overflow-hidden">
        <img src={after} alt="" className="h-full w-full object-cover" />
      </div>
      <div className="savi-compare-handle absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(124,58,237,0.32),0_0_22px_rgba(124,58,237,0.28)]" />
      <div className="absolute left-2 top-2 rounded-full bg-slate-950/75 px-2 py-0.5 text-[9px] font-black text-white">After</div>
      <div className="absolute right-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[9px] font-black text-slate-900">Before</div>
    </div>
  );
}

function BeforeAfter({ before, after }: { before: string; after: string }) {
  const [position, setPosition] = useState(32);
  const [isAutoPreview, setIsAutoPreview] = useState(true);

  useEffect(() => {
    setPosition(32);
    setIsAutoPreview(true);
  }, [before, after]);

  useEffect(() => {
    if (!isAutoPreview) return;

    const timer = window.setInterval(() => {
      setPosition((current) => (current < 50 ? 78 : 32));
    }, 1700);

    return () => window.clearInterval(timer);
  }, [isAutoPreview]);

  return (
    <div className="mx-auto max-w-[560px]">
      <div className="relative aspect-[16/9] overflow-hidden rounded-[20px] border border-violet-100 bg-slate-100">
        <img src={before} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 overflow-hidden transition-[clip-path] duration-700 ease-in-out" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
          <img src={after} alt="" className="h-full w-full object-cover" />
        </div>
        <div className="absolute inset-y-0 bg-white transition-[left] duration-700 ease-in-out shadow-[0_0_0_1px_rgba(124,58,237,0.3),0_0_30px_rgba(124,58,237,0.22)]" style={{ left: `${position}%`, width: 2 }} />
        <div className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-xs font-black text-white">After</div>
        <div className="absolute right-3 top-3 rounded-full bg-white/85 px-3 py-1 text-xs font-black text-slate-900">Before</div>
      </div>
      <input
        aria-label="Compare before and after"
        type="range"
        min="18"
        max="82"
        value={position}
        onPointerDown={() => setIsAutoPreview(false)}
        onChange={(event) => {
          setIsAutoPreview(false);
          setPosition(Number(event.target.value));
        }}
        className="mt-3 w-full accent-violet-600"
      />
    </div>
  );
}

function SlidePreview({ compact, slides }: { compact: boolean; slides: NonNullable<PreviewConfig['slides']> }) {
  const items = slides.length
    ? slides
    : [
        { label: 'SAVI request', text: 'Turn my rough idea into a clean, useful deliverable with a premium visual style.' },
        { label: 'Finished result', text: 'A polished output with clear structure, practical wording, and ready-to-use formatting.' }
      ];
  const previewItems = compact ? items.slice(0, 3) : items;
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = previewItems[activeIndex % previewItems.length];

  useEffect(() => {
    setActiveIndex(0);
  }, [previewItems.length]);

  useEffect(() => {
    if (previewItems.length < 2) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % previewItems.length);
    }, compact ? 2600 : 3200);

    return () => window.clearInterval(timer);
  }, [compact, previewItems.length]);

  const goToSlide = (direction: -1 | 1) => {
    setActiveIndex((current) => (current + direction + previewItems.length) % previewItems.length);
  };

  return (
    <div className={`${compact ? 'p-2' : ''}`}>
      <div className={`relative overflow-hidden rounded-[16px] border border-violet-100 bg-white/80 ${compact ? 'h-[118px]' : 'min-h-[268px]'}`}>
        <SlideCard key={`${activeSlide.label}-${activeSlide.text || activeSlide.src}-${activeIndex}`} slide={activeSlide} compact={compact} />
      </div>

      {previewItems.length > 1 && (
        <div className={`mt-3 flex items-center ${compact ? 'justify-center' : 'justify-between'} gap-3`}>
          {!compact && (
            <button type="button" onClick={() => goToSlide(-1)} className="mini-tool-button" aria-label="Previous preview step">
              &lt;
            </button>
          )}
          <div className="flex items-center justify-center gap-1.5">
            {previewItems.map((slide, index) => (
              compact ? (
                <span
                  key={`${slide.label}-dot-${index}`}
                  aria-hidden="true"
                  className={`h-1.5 rounded-full transition ${index === activeIndex % previewItems.length ? 'w-5 bg-violet-600' : 'w-1.5 bg-violet-200'}`}
                />
              ) : (
                <button
                  key={`${slide.label}-dot-${index}`}
                  type="button"
                  aria-label={`Show ${slide.label}`}
                  onClick={() => setActiveIndex(index)}
                  className={`h-1.5 rounded-full transition ${index === activeIndex % previewItems.length ? 'w-5 bg-violet-600' : 'w-1.5 bg-violet-200'}`}
                />
              )
            ))}
          </div>
          {!compact && (
            <button type="button" onClick={() => goToSlide(1)} className="mini-tool-button" aria-label="Next preview step">
              &gt;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SlideCard({ slide, compact }: { slide: NonNullable<PreviewConfig['slides']>[number]; compact: boolean }) {
  if (slide.src) {
    return (
      <div className="savi-slide-in relative h-full w-full">
        <img src={slide.src} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-x-2 bottom-2 rounded-full bg-white/86 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700 shadow-sm backdrop-blur">
          {slide.label}
        </div>
      </div>
    );
  }

  return (
      <div className="savi-slide-in grid h-full w-full place-items-center bg-gradient-to-br from-violet-50 via-white to-blue-50 p-3 text-center">
      <div>
        <p className="text-[9px] font-bold uppercase text-violet-600">{slide.label}</p>
        <p className={`mx-auto mt-2 max-w-[34rem] whitespace-pre-line font-semibold text-slate-700 ${compact ? 'text-[10px] leading-4' : 'text-sm leading-6'}`}>
          {slide.text}
        </p>
      </div>
    </div>
  );
}

function AudioPreview({ compact, media }: { compact: boolean; media?: string }) {
  const bars = [24, 44, 30, 62, 36, 72, 48, 58, 28, 66, 40, 52];

  return (
    <div className={`overflow-hidden bg-gradient-to-br from-violet-50 via-white to-blue-50 ${compact ? 'p-2.5' : 'rounded-[22px] p-4'}`}>
      <div className="savi-slide-in">
        <div className={`flex items-center gap-1.5 ${compact ? 'h-[82px]' : 'h-32'}`}>
          {bars.map((height, index) => (
            <span
              key={index}
              className="savi-audio-bar w-full rounded-full bg-gradient-to-t from-violet-600 to-blue-400"
              style={{
                height: compact ? height * 0.68 : height,
                animationDelay: `${index * 90}ms`
              }}
            />
          ))}
        </div>
      </div>
      {!compact && media && <audio controls src={media} className="mt-3 w-full" />}
    </div>
  );
}

function PdfPreview({ compact, slides }: { compact: boolean; slides: NonNullable<PreviewConfig['slides']> }) {
  const docs = slides.length ? slides : [{ label: 'Contract.pdf' }, { label: 'Invoice.pdf' }, { label: 'Merged file' }];
  const [activeIndex, setActiveIndex] = useState(0);
  const visibleDocs = docs.slice(0, 3);
  const activeDoc = visibleDocs[activeIndex % visibleDocs.length];
  const nextDoc = visibleDocs[(activeIndex + 1) % visibleDocs.length];

  useEffect(() => {
    setActiveIndex(0);
  }, [visibleDocs.length]);

  useEffect(() => {
    if (visibleDocs.length < 2) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % visibleDocs.length);
    }, compact ? 2300 : 2800);

    return () => window.clearInterval(timer);
  }, [compact, visibleDocs.length]);

  return (
    <div className={`overflow-hidden ${compact ? 'p-2' : 'rounded-[22px] bg-gradient-to-br from-violet-50 via-white to-blue-50 p-4'}`}>
      {compact ? (
        <PdfCard key={`${activeDoc.label}-${activeIndex}`} doc={activeDoc} compact />
      ) : (
        <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <PdfCard key={`${activeDoc.label}-active-${activeIndex}`} doc={activeDoc} compact={false} />
          <div className="grid place-items-center rounded-full bg-violet-600 px-3 py-2 text-xs font-black text-white shadow-[0_12px_30px_rgba(124,58,237,0.2)]">
            {activeIndex % visibleDocs.length === visibleDocs.length - 1 ? 'Done' : 'Next'}
          </div>
          <PdfCard key={`${nextDoc.label}-next-${activeIndex}`} doc={nextDoc} compact={false} muted />
        </div>
      )}
      {visibleDocs.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5">
          {visibleDocs.map((doc, index) => (
            compact ? (
              <span
                key={`${doc.label}-pdf-dot-${index}`}
                aria-hidden="true"
                className={`h-1.5 rounded-full transition ${index === activeIndex % visibleDocs.length ? 'w-5 bg-violet-600' : 'w-1.5 bg-violet-200'}`}
              />
            ) : (
              <button
                key={`${doc.label}-pdf-dot-${index}`}
                type="button"
                aria-label={`Show ${doc.label}`}
                onClick={() => setActiveIndex(index)}
                className={`h-1.5 rounded-full transition ${index === activeIndex % visibleDocs.length ? 'w-5 bg-violet-600' : 'w-1.5 bg-violet-200'}`}
              />
            )
          ))}
        </div>
      )}
    </div>
  );
}

function PdfCard({ doc, compact, muted = false }: { doc: { label: string }; compact: boolean; muted?: boolean }) {
  return (
    <div className={`savi-slide-in rounded-[16px] border border-violet-100 bg-white/85 p-2 shadow-sm ${muted ? 'opacity-60' : ''}`}>
      <div className={`${compact ? 'h-[102px]' : 'h-28'} rounded-xl bg-white p-2`}>
        <span className="block h-2 rounded-full bg-violet-200" />
        <span className="mt-2 block h-2 w-3/4 rounded-full bg-blue-100" />
        <span className="mt-2 block h-2 w-2/3 rounded-full bg-slate-100" />
        <span className="mt-2 block h-2 w-4/5 rounded-full bg-slate-100" />
        <span className="mt-2 block h-2 w-1/2 rounded-full bg-violet-100" />
      </div>
      <p className="mt-2 truncate text-center text-[11px] font-black text-slate-600">{doc.label}</p>
    </div>
  );
}
