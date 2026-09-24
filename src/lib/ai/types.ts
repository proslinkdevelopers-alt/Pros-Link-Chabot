/** A single turn of a conversation's transcript. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
