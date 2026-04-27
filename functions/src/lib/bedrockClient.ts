// PRODUCTION SWAP ─────────────────────────────────────────────────────────────
// Replace the mock below with a real Claude call via AWS Bedrock:
//
//   import {
//     BedrockRuntimeClient,
//     InvokeModelCommand,
//   } from "@aws-sdk/client-bedrock-runtime";
//
//   const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION! });
//
//   export const MODEL_ID = "anthropic.claude-sonnet-4-5";
//
//   export async function invokeModel(prompt: string): Promise<string> {
//     const payload = {
//       anthropic_version: "bedrock-2023-05-31",
//       max_tokens: 1024,
//       messages: [{ role: "user", content: prompt }],
//     };
//     const command = new InvokeModelCommand({
//       modelId: MODEL_ID,
//       body: JSON.stringify(payload),
//       contentType: "application/json",
//       accept: "application/json",
//     });
//     const response = await client.send(command);
//     const body = JSON.parse(Buffer.from(response.body).toString());
//     const text = body.content?.[0]?.text;
//     if (!text) throw new Error("Empty response from Bedrock");
//     return text;
//   }
//
// Required IAM permission on the Cloud Functions service account:
//   bedrock:InvokeModel on the target model ARN
// Required package: @aws-sdk/client-bedrock-runtime (already in package.json)
// ─────────────────────────────────────────────────────────────────────────────

export const MODEL_ID = "anthropic.claude-sonnet-4-5-mock";

export async function invokeModel(_prompt: string): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, 50));

  return [
    "This record documents a routine outpatient visit.",
    "The patient presented with mild upper respiratory symptoms including congestion and a low-grade fever.",
    "Vital signs were within normal limits: blood pressure 118/76 mmHg, heart rate 72 bpm, temperature 37.4°C, and weight 74 kg.",
    "No significant changes to current medications were noted.",
    "The attending physician recommended rest, increased fluid intake, and a follow-up visit if symptoms persist beyond seven days.",
    "No acute diagnoses were made and no specialist referrals were required at this time.",
  ].join(" ");
}