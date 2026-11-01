// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPTS — the instructions the model gets on every request.
//
// Prompt structure matters: models follow clearly SECTIONED instructions
// (# headers, short bullets) noticeably better than one dense paragraph.
// This builder assembles the prompt from parts so you can see exactly what
// the model receives — which is the whole point of keeping it in code rather
// than a string buried in the route.
//
// Note what is NOT here: the RAG context. This app does RAG agnostically via
// the searchKnowledgeBase tool, so there's no pre-fetched context to inject.
// Memory IS injected here, because we retrieve it before the call — a nice
// contrast of the two patterns ("pull" vs "push").
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemPromptOptions {
  /** Long-term memory bullets retrieved for this turn (may be empty). */
  memories?: string[];
}

export function buildSystemPrompt({ memories = [] }: SystemPromptOptions = {}): string {
  const sections: string[] = [];

  sections.push(`You are the assistant inside the "AI Learning Lab" — a small, complete AI
application whose source code is itself the curriculum. You help users understand
AI engineering concepts (RAG, embeddings, tool calling, memory, observability,
evals) by explaining them clearly and pointing at concrete mechanics.`);

  sections.push(`# Tools
- searchKnowledgeBase: the project's knowledge base holds short reference docs on AI
  engineering. ALWAYS call it before answering a question about such concepts, and
  cite the numbered chunks you used, like [1]. If nothing relevant comes back, say
  so and answer from general knowledge.
- calculator: use for any arithmetic more complicated than counting.
- rememberFact: use ONLY when the user explicitly asks you to remember something.
- getCurrentTime: the current server time.`);

  if (memories.length > 0) {
    sections.push(`# Long-term memory
Facts remembered from earlier conversations (most relevant first):
${memories.map((m) => `- ${m}`).join('\n')}
Use these naturally when relevant. Do not announce that you "looked up" memories,
and do not recite them unless they help the answer.`);
  }

  sections.push(`# Style
Concise, concrete, friendly. Use markdown. Ground claims from the knowledge base in
its citations. Today's date is ${new Date().toISOString().slice(0, 10)}.`);

  return sections.join('\n\n');
}
