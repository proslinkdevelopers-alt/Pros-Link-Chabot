/**
 * Whether a reply is waiting on an answer from the customer.
 *
 * Buttons are withheld under a reply that asks something: offering "Request a
 * Quote" underneath "Which city are you in?" pulls the customer away from
 * answering. A closing "anything else?" is not waiting on an answer — it hands
 * the turn back, which is exactly when buttons help.
 */

/** A closing "anything else I can help with?" in the four languages. */
const CLOSING_QUESTION =
  /(anything else|something else|what else|else (i|we) can|aur (kuch|koi|kisi)|(kuch|koi|kisi) aur|mazeed (kuch|koi|madad|maloomat|sawal)|کچھ اور|کوئی اور|کسی اور|مزید (کچھ|کوئی|مدد|معلومات|سوال)|ہور (کجھ|کوئی)|(کجھ|کوئی) ہور)/i;

/** True when the reply ends on a question the customer is expected to answer. */
export function asksQuestion(reply: string): boolean {
  const lastLine = reply.trim().split("\n").pop()?.trim() ?? "";
  if (!/[?؟][\s*_)"'”’]*$/.test(lastLine)) return false;
  // Only the final sentence decides: "I've noted your number. Anything else?"
  // hands the turn back even though an earlier sentence may have been a request.
  const lastSentence = lastLine.split(/(?<=[.!?؟])\s+/).pop() ?? lastLine;
  return !CLOSING_QUESTION.test(lastSentence);
}
