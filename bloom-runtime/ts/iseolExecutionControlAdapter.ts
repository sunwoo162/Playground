import type { ProjectExecutionControlAction, ProjectExecutionControlRecord } from "./executionControl";
import {
  getProjectExecutionControl,
  requestProjectPause,
  requestProjectResume,
  requestProjectStop,
} from "./executionControl";
import {
  validateIseolHarnessControlCommand,
  type IseolHarnessControlCommand,
} from "./iseolHarnessProtocol";
import type { ProjectState } from "./types";

export type IseolExecutionControlMapping =
  | ProjectExecutionControlAction
  | "status"
  | "retry";

export type IseolExecutionControlResult = {
  status: "applied" | "observed" | "deferred";
  control: ProjectExecutionControlRecord;
  reason: string | null;
};
function assertProjectIdentity(
  command: IseolHarnessControlCommand,
  project: ProjectState,
): void {
  if (command.identity.projectId !== project.id) {
    throw new Error(
      `Iseol Harness control project mismatch: command=${command.identity.projectId}, project=${project.id}.`,
    );
  }
}

export function mapIseolControlToBloomAction(
  input: unknown,
  project: ProjectState,
): IseolExecutionControlMapping {
  const command = validateIseolHarnessControlCommand(input);
  assertProjectIdentity(command, project);

  switch (command.action) {
    case "pause": return "pause";
    case "resume": return "resume";
    case "cancel": return "stop";
    case "status": return "status";
    case "retry": return "retry";
  }
}
export function applyIseolProjectControl(
  input: unknown,
  project: ProjectState,
): IseolExecutionControlResult {
  const command = validateIseolHarnessControlCommand(input);
  assertProjectIdentity(command, project);

  if (command.action === "status") {
    return {
      status: "observed",
      control: getProjectExecutionControl(project.id),
      reason: null,
    };
  }

  if (command.action === "retry") {
    return {
      status: "deferred",
      control: getProjectExecutionControl(project.id),
      reason: "Retry is deferred until run reconciliation and idempotency are enforced.",
    };
  }
  const control = command.action === "pause"
    ? requestProjectPause(project, command.requestedAt)
    : command.action === "resume"
      ? requestProjectResume(project, command.requestedAt)
      : requestProjectStop(project, command.requestedAt);

  return {
    status: "applied",
    control,
    reason: null,
  };
}
