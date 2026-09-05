export function createMockResponse(input: string, mode: string, templateTitle?: string) {
  const target = templateTitle ? ` using the “${templateTitle}” template` : '';
  const cleanInput = input.trim() || 'your uploaded content';

  return `Mock result${target}:\n\nI understood the request in ${mode} mode. Here is a clean, structured output based on: “${cleanInput.slice(0, 140)}${cleanInput.length > 140 ? '...' : ''}”\n\n• Key idea: turn scattered input into a clear output.\n• Suggested next step: review, refine, and export.\n• Future integration: this response will come from Gemini through a secure backend route.\n\nTODO: connect real Gemini / iLovePDF / voice generation APIs after credit checks are in place.`;
}
