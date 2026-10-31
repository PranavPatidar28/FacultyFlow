import { sleep } from "workflow";
import { runGeneration } from "@/lib/generation";
import { mutate } from "@/lib/store";
import { expireOffers } from "@/lib/domain";
import { refreshRepairPlans } from "@/lib/repairs";
import { runRepairPlan } from "@/lib/repair-jobs";
async function generationStep(jobId: string) {
  "use step";
  console.info("generation.start", { jobId });
  const id = await runGeneration(jobId);
  console.info("generation.complete", { jobId, versionId: id });
  return id;
}
export async function generationWorkflow(jobId: string) {
  "use workflow";
  return await generationStep(jobId);
}
async function expiryStep(offerId: string) {
  "use step";
  console.info("offer.expire", { offerId });
  await mutate((s) => {
    expireOffers(s);
    s.revision++;
  });
}
export async function offerExpiryWorkflow(offerId: string, expiresAt: string) {
  "use workflow";
  await sleep(new Date(expiresAt));
  await expiryStep(offerId);
}
async function repairGenerationStep(planId: string) {
  "use step";
  console.info("repair.generate", { planId });
  return await runRepairPlan(planId);
}
async function repairExpiryStep(planId: string) {
  "use step";
  console.info("repair.expire", { planId });
  await mutate((s) => {
    if (refreshRepairPlans(s)) s.revision++;
  });
}
export async function repairWorkflow(planId: string) {
  "use workflow";
  const deadline = await repairGenerationStep(planId);
  if (deadline) {
    await sleep(new Date(deadline));
    await repairExpiryStep(planId);
  }
}
