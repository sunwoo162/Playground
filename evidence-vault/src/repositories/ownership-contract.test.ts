import { expectTypeOf, test } from "vitest";
import { getCase } from "./case-repository";
import { getEvidenceFile } from "./evidence-repository";
import { getExportPacket } from "./export-repository";
import { getVaultItem } from "./vault-repository";

test("user-owned repository reads require ownerUserId and resource id together", () => {
  expectTypeOf(getVaultItem).parameter(0).toMatchTypeOf<{ ownerUserId: string; id: string }>();
  expectTypeOf(getEvidenceFile).parameter(0).toMatchTypeOf<{ ownerUserId: string; id: string }>();
  expectTypeOf(getCase).parameter(0).toMatchTypeOf<{ ownerUserId: string; id: string }>();
  expectTypeOf(getExportPacket).parameter(0).toMatchTypeOf<{ ownerUserId: string; id: string }>();
});
