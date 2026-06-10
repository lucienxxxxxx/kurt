/**
 * AskProvider — the seam through which the `ask_user` tool puts a question to the
 * user and gets an answer. Mirrors PermissionProvider: the engine/tool only knows
 * this interface; the front-end (TUI overlay, stdin prompt, …) implements it.
 */

export interface AskRequest {
  /** The question to put to the user. */
  question: string;
  /** Optional multiple-choice options, shown as A/B/C/… (the user may still type). */
  options?: string[];
}

export interface AskProvider {
  /**
   * Ask the user `req`; resolve with their answer (a chosen option's text, or
   * free-form text). Resolve with "" if skipped/aborted. Honor `signal` if given.
   */
  ask(req: AskRequest, signal?: AbortSignal): Promise<string>;
}
