# Luna Project Teams

Detailed owner-only Luna Agent System organization, team, delivery, review, QA, release, and evolution documentation is maintained in the private `BloomBouquet/.github` repository.

This public repository keeps only the executable contracts required by the runtime. Current code-level entry points include:

- Agent/team catalog and execution policy: `bloom-runtime/ts/catalog.ts`
- senior Agent baseline: `bloom-runtime/ts/seniorAgent.ts`
- specialist routing: `bloom-runtime/ts/specialistRouting.ts`
- headless orchestration: `bloom-runtime/ts/headlessBuilderExecutor.ts`
- Luna Visual Style Baseline: `bloom-runtime/ts/lunaVisualStyle.ts`
- BloomBouquet registration handoff: `bloom-runtime/ts/bloomBouquetRegistration.ts`

Generated product repositories normally target the `BloomBouquet` GitHub Organization. User-facing projects receive the Luna visual baseline by default, but their layout and information architecture remain specific to the product and explicit Product Owner direction.

Do not duplicate private Luna operating documentation in this public repository.
