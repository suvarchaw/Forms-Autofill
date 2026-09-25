// Chrome's built-in Prompt API (Gemini Nano). Not in @types/chrome; only what we use.
// https://developer.chrome.com/docs/ai/prompt-api
type LanguageModelOptions = {
  expectedInputs?: { type: 'text'; languages: string[] }[];
  expectedOutputs?: { type: 'text'; languages: string[] }[];
};

interface LanguageModelSession {
  prompt(input: string, options?: { responseConstraint?: object }): Promise<string>;
  destroy(): void;
}

declare var LanguageModel: {
  availability(options?: LanguageModelOptions): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create(
    options?: LanguageModelOptions & {
      initialPrompts?: { role: 'system' | 'user' | 'assistant'; content: string }[];
      monitor?: (m: EventTarget) => void;
    },
  ): Promise<LanguageModelSession>;
};
