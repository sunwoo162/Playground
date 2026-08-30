import {
  deliverProject,
  LunaDeliveryError,
  type LunaDeliveryControllerDependencies,
  type LunaDeliveryResult,
} from "./lunaDeliveryController";
import {
  LunaDeliveryEvaluationPendingError,
  type LunaDeliveryHttpClient,
  type LunaDeliveryProjectState,
  type LunaDeliveryProjectUpsertRequest,
  type LunaDeliveryRegistrationRequest,
  type LunaDeliveryRegistrationResponse,
  type LunaDeliveryTransitionRequest,
} from "./lunaDeliveryHttpClient";

export type LunaDeliveryAutomationClient = Pick<
  LunaDeliveryHttpClient,
  "upsertProject" | "transition" | "registerSubmission"
>;

export type AutomateLunaDeliveryInput<BuildEvidence, CandidateEvidence, GatewayEvidence> = {
  slug: string;
  gitSha: string;
  workspacePath?: string;
  repositoryFullName: string;
  registration: LunaDeliveryRegistrationRequest;
  client: LunaDeliveryAutomationClient;
  dependencies: LunaDeliveryControllerDependencies<BuildEvidence, CandidateEvidence, GatewayEvidence>;
};

export type LunaDeliveryAutomationResult<BuildEvidence, CandidateEvidence, GatewayEvidence> = {
  delivery: LunaDeliveryResult<BuildEvidence, CandidateEvidence, GatewayEvidence>;
  registration: LunaDeliveryRegistrationResponse;
  project: LunaDeliveryProjectState;
};

function projectUpsertRequest<BuildEvidence, CandidateEvidence, GatewayEvidence>(
  input: AutomateLunaDeliveryInput<BuildEvidence, CandidateEvidence, GatewayEvidence>,
): LunaDeliveryProjectUpsertRequest {
  return {
    slug: input.slug,
    repositoryFullName: input.repositoryFullName,
    mainSha: input.gitSha,
    publicUrl: `https://bloombouquet.https.gsmsv.site/apps/${input.slug}/`,
  };
}

async function transition(
  client: LunaDeliveryAutomationClient,
  slug: string,
  state: string,
  extra: Omit<LunaDeliveryTransitionRequest, "state"> = {},
) {
  return client.transition(slug, { state, ...extra });
}

export async function automateLunaDelivery<BuildEvidence, CandidateEvidence, GatewayEvidence>(
  input: AutomateLunaDeliveryInput<BuildEvidence, CandidateEvidence, GatewayEvidence>,
): Promise<LunaDeliveryAutomationResult<BuildEvidence, CandidateEvidence, GatewayEvidence>> {
  await input.client.upsertProject(input.slug, projectUpsertRequest(input));
  await transition(input.client, input.slug, "MERGED");
  await transition(input.client, input.slug, "DELIVERY_PLANNING");
  await transition(input.client, input.slug, "BUILDING");

  const dependencies: LunaDeliveryControllerDependencies<
    BuildEvidence,
    CandidateEvidence,
    GatewayEvidence
  > = {
    build: input.dependencies.build,
    async installCandidate(buildEvidence) {
      const candidate = await input.dependencies.installCandidate(buildEvidence);
      await transition(input.client, input.slug, "CANDIDATE_READY");
      return candidate;
    },
    async verifyLocal(candidateEvidence, buildEvidence) {
      await transition(input.client, input.slug, "LOCAL_VERIFYING");
      return input.dependencies.verifyLocal(candidateEvidence, buildEvidence);
    },
    async activateGateway(candidateEvidence, buildEvidence) {
      await transition(input.client, input.slug, "GATEWAY_SWITCHING");
      return input.dependencies.activateGateway(candidateEvidence, buildEvidence);
    },
    async verifyPublic(gatewayEvidence, candidateEvidence, buildEvidence) {
      await transition(input.client, input.slug, "PUBLIC_VERIFYING");
      await input.dependencies.verifyPublic(gatewayEvidence, candidateEvidence, buildEvidence);
      await transition(input.client, input.slug, "DEPLOYED");
    },
    rollbackGateway: input.dependencies.rollbackGateway,
    rollbackCandidate: input.dependencies.rollbackCandidate,
  };

  let delivery: LunaDeliveryResult<BuildEvidence, CandidateEvidence, GatewayEvidence>;
  try {
    delivery = await deliverProject({
      slug: input.slug,
      gitSha: input.gitSha,
      workspacePath: input.workspacePath,
      dependencies,
    });
  } catch (error) {
    if (error instanceof LunaDeliveryError) {
      await transition(input.client, input.slug, error.code, {
        failureCode: error.code,
        failureReason: error.message,
      });
    }
    throw error;
  }

  await transition(input.client, input.slug, "REGISTERING");

  let registration: LunaDeliveryRegistrationResponse;
  try {
    registration = await input.client.registerSubmission({
      ...input.registration,
      projectSlug: input.slug,
      version: delivery.releaseVersion,
      demoUrl: delivery.publicUrl,
    });
  } catch (error) {
    if (error instanceof LunaDeliveryEvaluationPendingError) {
      await transition(input.client, input.slug, "BLOOMBOUQUET_REGISTERED");
      await transition(input.client, input.slug, "EVALUATION_PENDING", {
        failureCode: "EVALUATION_PENDING",
        failureReason: error.message,
      });
    } else {
      await transition(input.client, input.slug, "REGISTRATION_PENDING", {
        failureCode: "REGISTRATION_PENDING",
        failureReason: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }

  await transition(input.client, input.slug, "BLOOMBOUQUET_REGISTERED");
  await transition(input.client, input.slug, "EVALUATION_QUEUED");
  const project = await transition(input.client, input.slug, "COMPLETED");

  return { delivery, registration, project };
}
