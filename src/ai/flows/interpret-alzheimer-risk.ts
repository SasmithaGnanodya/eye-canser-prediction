
'use server';
/**
 * @fileOverview Interprets Alzheimer's risk based on eye image analysis, visualizes the risk level, and suggests next steps.
 *
 * - interpretAlzheimerRisk - A function that interprets the risk and provides recommendations.
 * - InterpretAlzheimerRiskInput - The input type for the interpretAlzheimerRisk function.
 * - InterpretAlzheimerRiskOutput - The return type for the interpretAlzheimerRisk function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const InterpretAlzheimerRiskInputSchema = z.object({
  riskPrediction: z
    .number()
    .describe('The probability score from the eye image analysis for the effective predicted class (0-1). This is the primary score used for interpretation.'),
  predictedClassName: z
    .string()
    .describe('The name of the effective class predicted by the eye image analysis model (e.g., "Glaucoma", "Normal") after any comparison logic.')
});
export type InterpretAlzheimerRiskInput = z.infer<typeof InterpretAlzheimerRiskInputSchema>;

const InterpretAlzheimerRiskOutputSchema = z.object({
  interpretation: z.string().describe('A detailed and professional interpretation of the risk level and findings.'),
  visualization: z.string().describe('A visualization of the risk level (e.g., a percentage or a simple graphic description).'),
  nextSteps: z.string().describe('Professional and actionable suggested next steps based on the risk level.'),
});
export type InterpretAlzheimerRiskOutput = z.infer<typeof InterpretAlzheimerRiskOutputSchema>;

// Schema for the data passed to the prompts, reflecting the effective outcome of the initial analysis
const InterpretAlzheimerRiskPromptInputSchema = z.object({
  effectivePredictedClass: z.string().describe('The name of the effective predicted class used for interpretation (e.g., "Normal", "Glaucoma").'),
  effectivePredictedClassConfidence: z.number().describe('The confidence score (0-1 scale) for the effective predicted class.'),
  effectivePredictedClassConfidencePercent: z.number().describe('The confidence score for the effective predicted class as a rounded percentage (0-100).'),
  riskCategory: z.enum(['positive', 'negative', 'inconclusive']).describe('The determined risk category based on the effective predicted class.'),
});
export type InterpretAlzheimerRiskPromptInput = z.infer<typeof InterpretAlzheimerRiskPromptInputSchema>;


export async function interpretAlzheimerRisk(input: InterpretAlzheimerRiskInput): Promise<InterpretAlzheimerRiskOutput> {
  return interpretAlzheimerRiskFlow(input);
}

const negativeInterpretPrompt = ai.definePrompt({
  name: 'negativeInterpretPrompt',
  input: {schema: InterpretAlzheimerRiskPromptInputSchema},
  output: {schema: InterpretAlzheimerRiskOutputSchema},
  prompt: `You are an AI assistant providing preliminary interpretations of eye scan analyses for Alzheimer's risk screening. Your language must be professional, cautious, and emphasize that this is NOT a diagnosis but a screening result. The analysis resulted in a 'negative' risk category.

Analysis Details:
- Effective Predicted Class from Initial Analysis: {{{effectivePredictedClass}}}
- Model Confidence for this Class: {{{effectivePredictedClassConfidencePercent}}}%
- Determined Risk Category for Interpretation: negative

Generate the interpretation, visualization, and next steps:
- Interpretation: The initial analysis of your eye scan resulted in an effective classification of '{{{effectivePredictedClass}}}' with {{{effectivePredictedClassConfidencePercent}}}% confidence by the model. This is a reassuring finding. It indicates that, for the ocular characteristics assessed by this screening tool, no prominent markers often associated with increased Alzheimer's risk were detected. Therefore, based *solely* on this specific automated image analysis, your conceptual Alzheimer's risk is considered very low.
- Visualization: "Risk Level: {{{effectivePredictedClassConfidencePercent}}}% Confidence in '{{{effectivePredictedClass}}}' Classification (Indicates Very Low Alzheimer's Concern from this Scan)"
- Next Steps: While this screening result is reassuring regarding the specific factors analyzed, continue with regular comprehensive eye examinations as advised by your ophthalmologist. Maintaining a healthy lifestyle, including a balanced diet, regular physical activity, and cognitive engagement, supports long-term brain health. Remember, this tool does not replace professional medical advice or a comprehensive health assessment.

Provide the output strictly in the format defined by the InterpretAlzheimerRiskOutputSchema. Be empathetic but maintain a factual, professional tone.
`,
});

const positiveInterpretPrompt = ai.definePrompt({
  name: 'positiveInterpretPrompt',
  input: {schema: InterpretAlzheimerRiskPromptInputSchema},
  output: {schema: InterpretAlzheimerRiskOutputSchema},
  prompt: `You are an AI assistant providing preliminary interpretations of eye scan analyses for Alzheimer's risk screening. Your language must be professional, cautious, and emphasize that this is NOT a diagnosis but a screening result. The analysis resulted in a 'positive' risk category.

Analysis Details:
- Effective Predicted Class from Initial Analysis: {{{effectivePredictedClass}}}
- Model Confidence for this Class: {{{effectivePredictedClassConfidencePercent}}}%
- Determined Risk Category for Interpretation: positive

Generate the interpretation, visualization, and next steps:
- Interpretation: The initial analysis of your eye scan resulted in an effective classification of '{{{effectivePredictedClass}}}' with {{{effectivePredictedClassConfidencePercent}}}% confidence by the model. This specific classification suggests the presence of certain ocular features (e.g., potential optic nerve characteristics or retinal patterns) that, according to some research, may be statistically associated with an increased likelihood of developing Alzheimer's disease. **It is crucial to understand that this is a preliminary screening result from an automated tool and NOT a diagnosis of Alzheimer's disease or any other eye condition.** The confidence score reflects the model's certainty in identifying these specific ocular features, not a direct probability of having Alzheimer's.
- Visualization: Create a risk level string using 'Effective Predicted Class Confidence Percent' ({{{effectivePredictedClassConfidencePercent}}}% confidence in '{{{effectivePredictedClass}}}' classification):
  - If {{{effectivePredictedClassConfidence}}} > 0.7: "Risk Level: {{{effectivePredictedClassConfidencePercent}}}% Confidence in '{{{effectivePredictedClass}}}' Classification. Finding: High Likelihood of Concerning Ocular Indicators for Alzheimer's Risk Assessment."
  - Else if {{{effectivePredictedClassConfidence}}} > 0.4: "Risk Level: {{{effectivePredictedClassConfidencePercent}}}% Confidence in '{{{effectivePredictedClass}}}' Classification. Finding: Moderate Likelihood of Concerning Ocular Indicators for Alzheimer's Risk Assessment."
  - Else: "Risk Level: {{{effectivePredictedClassConfidencePercent}}}% Confidence in '{{{effectivePredictedClass}}}' Classification. Finding: Low Likelihood of Concerning Ocular Indicators for Alzheimer's Risk Assessment."
- Next Steps: Given these findings, a comprehensive medical evaluation is strongly recommended:
  1. Consult an **Ophthalmologist**: Schedule an appointment for a detailed eye health assessment to evaluate the ocular findings (related to the '{{{effectivePredictedClass}}}' classification) and overall eye health.
  2. Discuss with **Neurologist/Primary Care Physician**: Subsequently, discuss these screening results and any ophthalmological findings with a neurologist or your primary care physician experienced in cognitive health. They can consider these results in the context of your complete medical history, family history, lifestyle, and other relevant risk factors to provide a holistic assessment.
  3. Further Tests: Additional diagnostic tests may be recommended by your healthcare providers to clarify your health status.
  This tool does not replace professional medical advice, diagnosis, or treatment. Early consultation can lead to better management and outcomes.

Provide the output strictly in the format defined by the InterpretAlzheimerRiskOutputSchema. Be empathetic but maintain a factual, professional tone.
`,
});

const inconclusiveInterpretPrompt = ai.definePrompt({
  name: 'inconclusiveInterpretPrompt',
  input: {schema: InterpretAlzheimerRiskPromptInputSchema},
  output: {schema: InterpretAlzheimerRiskOutputSchema},
  prompt: `You are an AI assistant providing preliminary interpretations of eye scan analyses for Alzheimer's risk screening. Your language must be professional, cautious, and emphasize that this is NOT a diagnosis but a screening result. The analysis resulted in an 'inconclusive' risk category.

Analysis Details:
- Effective Predicted Class from Initial Analysis: {{{effectivePredictedClass}}}
- Model Confidence for this Class: {{{effectivePredictedClassConfidencePercent}}}%
- Determined Risk Category for Interpretation: inconclusive

Generate the interpretation, visualization, and next steps:
- Interpretation: The initial analysis of your eye scan resulted in an effective classification of '{{{effectivePredictedClass}}}' with {{{effectivePredictedClassConfidencePercent}}}% confidence by the model. This means the observed ocular features did not strongly align with either the 'Normal' or typical 'Glaucoma-like' patterns this screening tool is primarily trained to differentiate. Therefore, the direct implication for Alzheimer's risk based on this specific finding is unclear without further expert medical assessment. **This is a preliminary screening result from an automated tool.**
- Visualization: "Risk Level: Inconclusive ({{{effectivePredictedClass}}} at {{{effectivePredictedClassConfidencePercent}}}% Confidence) - Requires Expert Medical Review"
- Next Steps: It is important to consult a healthcare professional to discuss these results.
  1. Consult an **Ophthalmologist or your General Practitioner**: They can help interpret the significance of the '{{{effectivePredictedClass}}}' finding in the context of your overall eye health.
  2. Further Evaluation: Based on their assessment, they will determine if any further investigation or follow-up is necessary.
  This tool does not replace professional medical advice, diagnosis, or treatment.

Provide the output strictly in the format defined by the InterpretAlzheimerRiskOutputSchema. Be empathetic but maintain a factual, professional tone.
`,
});


const interpretAlzheimerRiskFlow = ai.defineFlow(
  {
    name: 'interpretAlzheimerRiskFlow',
    inputSchema: InterpretAlzheimerRiskInputSchema,
    outputSchema: InterpretAlzheimerRiskOutputSchema,
  },
  async (input: InterpretAlzheimerRiskInput) => {
    let riskCategory: 'positive' | 'negative' | 'inconclusive';
    
    const normalizedPredictedClassName = input.predictedClassName.toLowerCase();

    if (normalizedPredictedClassName === 'normal') {
      riskCategory = 'negative';
    } else if (normalizedPredictedClassName === 'glaucoma') {
      riskCategory = 'positive';
    } else {
      // Handle any other class names as inconclusive
      riskCategory = 'inconclusive';
    }

    const promptInputData: InterpretAlzheimerRiskPromptInput = {
      effectivePredictedClass: input.predictedClassName, // Use the original casing for display
      effectivePredictedClassConfidence: input.riskPrediction, 
      effectivePredictedClassConfidencePercent: Math.round(input.riskPrediction * 100),
      riskCategory: riskCategory,
    };
    
    if (riskCategory === 'positive') {
      const {output} = await positiveInterpretPrompt(promptInputData);
      return output!;
    } else if (riskCategory === 'negative') {
      const {output} = await negativeInterpretPrompt(promptInputData);
      return output!;
    } else { // inconclusive
      const {output} = await inconclusiveInterpretPrompt(promptInputData);
      return output!;
    }
  }
);


