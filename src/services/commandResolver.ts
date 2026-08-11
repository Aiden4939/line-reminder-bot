import { env } from "../config/env.js";
import { parseCommand, type ParsedCommand } from "./commandParser.js";
import { parseCommandWithLlm } from "./llmReminderParser.js";

export function resolveLlmHybridResult(
  llmCommand: ParsedCommand | null
): ParsedCommand {
  if (
    llmCommand?.type === "create" ||
    llmCommand?.type === "createRecurring" ||
    llmCommand?.type === "collectTimeForCreate" ||
    llmCommand?.type === "collectTimeForRecurring" ||
    llmCommand?.type === "confirmAmbiguousCreate"
  ) {
    return llmCommand;
  }
  if (llmCommand?.type === "help" && llmCommand.reason !== undefined) {
    return llmCommand;
  }
  return { type: "help", reason: "create_failed" };
}

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
    return resolveLlmHybridResult(llmCommand);
  } catch (error) {
    console.warn("[nlu] LLM parsing failed, fallback to create_failed:", error);
  }

  return { type: "help", reason: "create_failed" };
}
