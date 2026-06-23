import { env } from "../config/env.js";
import { parseCommand, type ParsedCommand } from "./commandParser.js";
import { parseCommandWithLlm } from "./llmReminderParser.js";

export async function resolveCommand(text: string): Promise<ParsedCommand> {
  const command = parseCommand(text);

  if (command.type !== "help" || command.reason !== undefined) {
    return command;
  }

  if (env.nluMode !== "hybrid" || !env.openaiApiKey) {
    return command;
  }

  try {
    const llmCommand = await parseCommandWithLlm(text);
    if (llmCommand) {
      return llmCommand;
    }
  } catch (error) {
    console.warn("[nlu] LLM parsing failed, fallback to help:", error);
  }

  return command;
}
