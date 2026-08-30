export type LunaDeliveryFailureCode =
  | "BLOCKED_MISSING_SECRET"
  | "BUILD_FAILED"
  | "DEPLOY_FAILED"
  | "HEALTH_FAILED";

export type LunaDeliveryStage =
  | "build"
  | "candidate"
  | "local-health"
  | "gateway-switch"
  | "public-health";

export type LunaRollbackState = "not-needed" | "restored" | "failed";

export type LunaRollbackResult = {
  gateway: LunaRollbackState;
  candidate: LunaRollbackState;
};

const NO_ROLLBACK: LunaRollbackResult = {
  gateway: "not-needed",
  candidate: "not-needed",
};

export class LunaDeliveryError extends Error {
  readonly code: LunaDeliveryFailureCode;
  readonly stage: LunaDeliveryStage;
  readonly rollbackResult: LunaRollbackResult;
  readonly cause?: unknown;

  constructor(
    code: LunaDeliveryFailureCode,
    stage: LunaDeliveryStage,
    message: string,
    rollbackResult: LunaRollbackResult = NO_ROLLBACK,
    cause?: unknown,
  ) {
    super(message);
    this.name = "LunaDeliveryError";
    this.code = code;
    this.stage = stage;
    this.rollbackResult = { ...rollbackResult };
    this.cause = cause;
  }
}

export type LunaDeliveryControllerDependencies<
  BuildEvidence,
  CandidateEvidence,
  GatewayEvidence,
> = {
  build: () => Promise<BuildEvidence>;
  installCandidate: (buildEvidence: BuildEvidence) => Promise<CandidateEvidence>;
  verifyLocal: (
    candidateEvidence: CandidateEvidence,
    buildEvidence: BuildEvidence,
  ) => Promise<void>;
  activateGateway: (
    candidateEvidence: CandidateEvidence,
    buildEvidence: BuildEvidence,
  ) => Promise<GatewayEvidence>;
  verifyPublic: (
    gatewayEvidence: GatewayEvidence,
    candidateEvidence: CandidateEvidence,
    buildEvidence: BuildEvidence,
  ) => Promise<void>;
  rollbackGateway: (gatewayEvidence: GatewayEvidence) => Promise<void>;
  rollbackCandidate: (candidateEvidence: CandidateEvidence) => Promise<void>;
};

export type DeliverProjectInput<BuildEvidence, CandidateEvidence, GatewayEvidence> = {
  slug: string;
  gitSha: string;
  dependencies: LunaDeliveryControllerDependencies<
    BuildEvidence,
    CandidateEvidence,
    GatewayEvidence
  >;
};

export type LunaDeliveryResult<BuildEvidence, CandidateEvidence, GatewayEvidence> = {
  publicUrl: string;
  releaseSha: string;
  evidence: {
    build: BuildEvidence;
    candidate: CandidateEvidence;
    gateway: GatewayEvidence;
  };
  rollbackResult: LunaRollbackResult;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

function validateIdentity(slug: string, gitSha: string) {
  if (!SLUG_PATTERN.test(slug)) {
    throw new LunaDeliveryError("DEPLOY_FAILED", "build", "Luna delivery slug is invalid.");
  }
  if (!SHA_PATTERN.test(gitSha)) {
    throw new LunaDeliveryError(
      "BUILD_FAILED",
      "build",
      "Luna delivery release SHA must be an exact 40-character lowercase Git SHA.",
    );
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function withRollback(
  error: LunaDeliveryError,
  rollbackResult: LunaRollbackResult,
) {
  return new LunaDeliveryError(
    error.code,
    error.stage,
    error.message,
    rollbackResult,
    error.cause ?? error,
  );
}

async function attemptRollback(operation: () => Promise<void>): Promise<LunaRollbackState> {
  try {
    await operation();
    return "restored";
  } catch {
    return "failed";
  }
}

export async function deliverProject<BuildEvidence, CandidateEvidence, GatewayEvidence>(
  input: DeliverProjectInput<BuildEvidence, CandidateEvidence, GatewayEvidence>,
): Promise<LunaDeliveryResult<BuildEvidence, CandidateEvidence, GatewayEvidence>> {
  validateIdentity(input.slug, input.gitSha);
  const deps = input.dependencies;

  let buildEvidence: BuildEvidence;
  try {
    buildEvidence = await deps.build();
  } catch (error) {
    if (error instanceof LunaDeliveryError) throw error;
    throw new LunaDeliveryError(
      "BUILD_FAILED",
      "build",
      errorMessage(error, "Luna delivery build failed."),
      NO_ROLLBACK,
      error,
    );
  }

  let candidateEvidence: CandidateEvidence;
  try {
    candidateEvidence = await deps.installCandidate(buildEvidence);
  } catch (error) {
    if (error instanceof LunaDeliveryError) throw error;
    throw new LunaDeliveryError(
      "DEPLOY_FAILED",
      "candidate",
      errorMessage(error, "Luna candidate installation failed."),
      NO_ROLLBACK,
      error,
    );
  }

  try {
    await deps.verifyLocal(candidateEvidence, buildEvidence);
  } catch (error) {
    const candidateRollback = await attemptRollback(
      () => deps.rollbackCandidate(candidateEvidence),
    );
    const rollbackResult: LunaRollbackResult = {
      gateway: "not-needed",
      candidate: candidateRollback,
    };
    if (error instanceof LunaDeliveryError) {
      throw withRollback(error, rollbackResult);
    }
    throw new LunaDeliveryError(
      "HEALTH_FAILED",
      "local-health",
      errorMessage(error, "Luna candidate local health check failed."),
      rollbackResult,
      error,
    );
  }

  let gatewayEvidence: GatewayEvidence;
  try {
    gatewayEvidence = await deps.activateGateway(candidateEvidence, buildEvidence);
  } catch (error) {
    const candidateRollback = await attemptRollback(
      () => deps.rollbackCandidate(candidateEvidence),
    );
    const rollbackResult: LunaRollbackResult = {
      gateway: "not-needed",
      candidate: candidateRollback,
    };
    if (error instanceof LunaDeliveryError) {
      throw withRollback(error, rollbackResult);
    }
    throw new LunaDeliveryError(
      "DEPLOY_FAILED",
      "gateway-switch",
      errorMessage(error, "Luna gateway activation failed."),
      rollbackResult,
      error,
    );
  }

  try {
    await deps.verifyPublic(gatewayEvidence, candidateEvidence, buildEvidence);
  } catch (error) {
    const gatewayRollback = await attemptRollback(
      () => deps.rollbackGateway(gatewayEvidence),
    );
    const candidateRollback = await attemptRollback(
      () => deps.rollbackCandidate(candidateEvidence),
    );
    const rollbackResult: LunaRollbackResult = {
      gateway: gatewayRollback,
      candidate: candidateRollback,
    };
    if (error instanceof LunaDeliveryError) {
      throw withRollback(error, rollbackResult);
    }
    throw new LunaDeliveryError(
      "HEALTH_FAILED",
      "public-health",
      errorMessage(error, "Luna public health check failed."),
      rollbackResult,
      error,
    );
  }

  return {
    publicUrl: `https://bloombouquet.https.gsmsv.site/apps/${input.slug}/`,
    releaseSha: input.gitSha,
    evidence: {
      build: buildEvidence,
      candidate: candidateEvidence,
      gateway: gatewayEvidence,
    },
    rollbackResult: { ...NO_ROLLBACK },
  };
}
