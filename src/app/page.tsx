
"use client";

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UploadCloud, Eye, Brain, FileDown, Loader2, Info, ShieldCheck, Cpu, Activity } from 'lucide-react';
import * as tmImage from '@teachablemachine/image';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { interpretAlzheimerRisk, type InterpretAlzheimerRiskOutput } from '@/ai/flows/interpret-alzheimer-risk';
import { useToast } from "@/hooks/use-toast";

// Teachable Machine model URL
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/TLrDyyvTP/";

interface PredictionClass {
  className: string;
  probability: number;
}

export default function AlzEyePredictPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [predictionResult, setPredictionResult] = useState<PredictionClass[] | null>(null);
  const [aiInterpretation, setAiInterpretation] = useState<InterpretAlzheimerRiskOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<tmImage.CustomMobileNet | null>(null);
  const [rawOutputForViz, setRawOutputForViz] = useState<{className: string | null; score: number | null}>({className: null, score: null});


  const resultsRef = useRef<HTMLDivElement>(null);
  const imageUploadRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Pre-load the model
    const loadModel = async () => {
      try {
        setLoadingMessage("Loading AI model...");
        const modelURL = MODEL_URL + "model.json";
        const metadataURL = MODEL_URL + "metadata.json";
        const loadedModel = await tmImage.load(modelURL, metadataURL);
        setModel(loadedModel);
        setLoadingMessage("");
      } catch (err) {
        console.error("Failed to load model:", err);
        setError("Failed to load the AI model. Please try refreshing the page.");
        setLoadingMessage("");
        toast({
          title: "Model Load Error",
          description: "Could not load the AI model. Please check your connection or try again later.",
          variant: "destructive",
        });
      }
    };
    loadModel();
  }, [toast]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setPredictionResult(null);
      setAiInterpretation(null);
      setError(null);
      setRawOutputForViz({className: null, score: null});
    }
  };

  const handlePredict = async () => {
    if (!imageFile || !model) {
      setError("Please upload an image and ensure the model is loaded.");
      toast({
        title: "Prediction Error",
        description: "Please upload an image first.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    setPredictionResult(null);
    setAiInterpretation(null);
    setRawOutputForViz({className: null, score: null});

    try {
      setLoadingMessage("Analyzing image...");
      const imageElement = document.createElement('img');
      imageElement.src = imagePreview!;
      await new Promise(resolve => imageElement.onload = resolve);
      
      const predictions: PredictionClass[] = await model.predict(imageElement);
      predictions.sort((a, b) => b.probability - a.probability); 
      setPredictionResult(predictions); 

      // Determine effective class and score for visualization AND AI interpretation from raw model output
      let vizClassName: string | null = null;
      let vizScore: number | null = null;

      if (predictions && predictions.length > 0) {
        const normalEntryViz = predictions.find(p => p.className.toLowerCase() === 'normal');
        const glaucomaEntryViz = predictions.find(p => p.className.toLowerCase() === 'glaucoma');
        const normalProbViz = normalEntryViz?.probability ?? 0;
        const glaucomaProbViz = glaucomaEntryViz?.probability ?? 0;

        if (glaucomaProbViz > normalProbViz) {
            vizClassName = glaucomaEntryViz!.className; // Prioritize Glaucoma if its prob is higher
            vizScore = glaucomaProbViz;
        } else if (normalProbViz >= glaucomaProbViz && normalEntryViz) { 
            vizClassName = normalEntryViz!.className; // Otherwise, if Normal prob is >= and exists
            vizScore = normalProbViz;
        } else if (glaucomaEntryViz && !normalEntryViz) { // Only Glaucoma detected
             vizClassName = glaucomaEntryViz!.className;
             vizScore = glaucomaProbViz;
        } else { 
            // Fallback to the top prediction from the raw model output if neither "Normal" nor "Glaucoma" is dominant or clearly identified
            vizClassName = predictions[0].className;
            vizScore = predictions[0].probability;
        }
      }
      setRawOutputForViz({ className: vizClassName, score: vizScore });

      // Ensure vizClassName and vizScore are set before calling AI flow
      if (vizClassName === null || vizScore === null) {
        // This case should be rare given the fallback, but good to have a check
        throw new Error("Could not determine a primary class from model output for AI interpretation. Predictions array might be empty or contain unexpected classes.");
      }
      
      setLoadingMessage("Interpreting results with AI...");
      const interpretationInput = { 
        riskPrediction: vizScore, // Use the score determined for visualization (effective score)
        predictedClassName: vizClassName // Use the class name determined for visualization (effective class)
      };
      const aiOutput = await interpretAlzheimerRisk(interpretationInput);
      setAiInterpretation(aiOutput);

      toast({
        title: "Analysis Complete",
        description: "Risk assessment and interpretation are ready.",
      });

    } catch (err) {
      console.error("Prediction or AI interpretation failed:", err);
      let errorMessage = "An error occurred during analysis. Please try again.";
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      toast({
        title: "Analysis Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  const handleExportPdf = async () => {
    if (!resultsRef.current) return;
    setIsLoading(true);
    setLoadingMessage("Generating PDF...");
    try {
      const canvas = await html2canvas(resultsRef.current, {
        scale: 2, 
        backgroundColor: '#121212', 
        onclone: (document) => { 
          Array.from(document.querySelectorAll('*')).forEach(element => {
            const htmlElement = element as HTMLElement;
            const style = window.getComputedStyle(htmlElement);
            if (style.color === 'rgb(249, 250, 251)' || style.color === 'hsl(var(--foreground))') { 
                htmlElement.style.color = '#E5E7EB'; 
            }
            if (htmlElement.classList.contains('pdf-text-dark')) {
                htmlElement.style.color = '#374151'; 
            }
            if(htmlElement.tagName === 'H1' || htmlElement.tagName === 'H2' || htmlElement.tagName === 'H3' || htmlElement.tagName === 'H4' || htmlElement.classList.contains('text-primary') || htmlElement.classList.contains('text-accent')) {
                 htmlElement.style.color = '#D1D5DB'; 
            }
            if (style.color === 'hsl(var(--muted-foreground))') {
                 htmlElement.style.color = '#9CA3AF';
            }
          });
        }
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgProps = pdf.getImageProperties(imgData);
      const ratio = imgProps.height / imgProps.width;
      const imgWidth = pdfWidth - 20; 
      const imgHeight = imgWidth * ratio;
      
      let heightLeft = imgHeight;
      let position = 10; 
      
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - 20); 

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight + 10; 
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - 20);
      }
      
      pdf.save('AlzEyePredict_Risk_Report.pdf');
      toast({
        title: "PDF Exported",
        description: "Your risk report has been downloaded.",
      });
    } catch (err) {
      console.error("PDF export failed:", err);
      setError("Failed to export PDF. Please try again.");
      toast({
        title: "PDF Export Error",
        description: "Could not export PDF. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };
  
  const RiskVisualizationDisplay = ({ modelClassName, modelScore }: { modelClassName: string | null; modelScore: number | null }) => {
    if (!modelClassName || modelScore === null) {
      return <p className="text-center text-muted-foreground py-4">Risk visualization data is being processed...</p>;
    }

    const percentage = Math.round(modelScore * 100);
    let progressColor = 'hsl(var(--primary))'; // Default blue for other/inconclusive
    let displayText = `${percentage}% confidence in '${modelClassName}' classification.`;

    const lowerModelClassName = modelClassName.toLowerCase();

    if (lowerModelClassName === 'glaucoma') {
      progressColor = 'hsl(var(--destructive))'; // Red
      displayText += " This may indicate ocular features potentially associated with increased Alzheimer's risk, warranting further review.";
    } else if (lowerModelClassName === 'normal') {
      progressColor = 'hsl(var(--success))'; // Green
      displayText += " This suggests findings are within expected ranges for the assessed ocular features, indicating very low Alzheimer's concern from this scan.";
    } else { 
      // For other, unexpected classes, keep default blue and general text
      displayText += ` The significance of this finding regarding Alzheimer's risk requires expert review.`;
    }

    return (
      <div className="my-4">
        <h3 className="text-xl font-semibold text-accent mb-2">Risk Visualization (from Raw Model Output)</h3>
        <div className="text-center text-sm text-muted-foreground mb-3 px-2 leading-relaxed">{displayText}</div>
        <Progress value={percentage} className="w-full h-4 [&>div]:bg-[var(--progress-color)]" style={{ '--progress-color': progressColor } as React.CSSProperties} />
      </div>
    );
  };


  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8 bg-background text-foreground">
      <header className="w-full max-w-4xl mb-8 text-center">
        <h1 className="text-4xl md:text-5xl font-bold text-primary flex items-center justify-center">
          <Eye className="w-10 h-10 md:w-12 md:h-12 mr-3" />
          AlzEyePredict
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground mt-2">AI-Powered Alzheimer’s Risk Predictor from Eye Scans</p>
      </header>

      <main className="w-full max-w-4xl mx-auto"> 
        <section className="mb-12 text-center">
          <h2 className="text-3xl font-semibold text-primary mb-4">Early Detection Through Eye Analysis</h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-3xl mx-auto">
            Recent research has shown strong correlations between eye health indicators, particularly glaucoma, and the risk of developing Alzheimer's disease. AlzEyePredict uses advanced AI to analyze eye images and identify potential risk factors.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center justify-center space-x-3 p-4 bg-card text-card-foreground rounded-lg shadow-md">
              <ShieldCheck className="h-6 w-6 text-accent flex-shrink-0" />
              <span className="font-medium">Non-invasive</span>
            </div>
            <div className="flex items-center justify-center space-x-3 p-4 bg-card text-card-foreground rounded-lg shadow-md">
              <Cpu className="h-6 w-6 text-accent flex-shrink-0" />
              <span className="font-medium">AI-powered analysis</span>
            </div>
            <div className="flex items-center justify-center space-x-3 p-4 bg-card text-card-foreground rounded-lg shadow-md">
              <Activity className="h-6 w-6 text-accent flex-shrink-0" />
              <span className="font-medium">Early risk detection</span>
            </div>
          </div>
        </section>

        <Card className="shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center text-2xl">
              <UploadCloud className="mr-2 h-6 w-6" /> Upload Eye Image
            </CardTitle>
            <CardDescription>
              Upload a clear image of an eye for Alzheimer's risk prediction based on potential glaucoma indicators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="eye-image-upload" className="text-base">Eye Image File</Label>
                <Input
                  id="eye-image-upload"
                  type="file"
                  accept="image/*"
                  ref={imageUploadRef}
                  onChange={handleImageChange}
                  className="mt-1 file:text-primary file:font-semibold hover:file:bg-primary/10"
                  disabled={isLoading}
                />
              </div>

              {imagePreview && (
                <div className="mt-4 border border-dashed border-border rounded-md p-4 flex flex-col items-center">
                  <Image
                    src={imagePreview}
                    alt="Uploaded eye preview"
                    width={200}
                    height={200}
                    className="rounded-md object-cover max-h-[200px] w-auto"
                    data-ai-hint="eye scan"
                  />
                  <p className="text-sm text-muted-foreground mt-2">Image Preview</p>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-stretch">
            <Button
              onClick={handlePredict}
              disabled={!imageFile || isLoading || !model}
              className="w-full text-lg py-6"
            >
              {isLoading && loadingMessage.startsWith("Analyzing") ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Brain className="mr-2 h-5 w-5" />
              )}
              {isLoading ? loadingMessage : "Predict Alzheimer's Risk"}
            </Button>
             {!model && !error && <p className="text-sm text-center text-muted-foreground mt-2"><Loader2 className="inline mr-1 h-4 w-4 animate-spin" />Loading AI model, please wait...</p>}
          </CardFooter>
        </Card>

        {error && (
          <Alert variant="destructive" className="mt-6">
            <Info className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {(predictionResult || aiInterpretation) && (
          <Card className="mt-8 shadow-2xl" ref={resultsRef}>
            <CardHeader>
              <CardTitle className="text-2xl text-primary">Risk Assessment Report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {imagePreview && (
                 <div className="my-4 p-2 border border-border rounded-md flex flex-col items-center bg-card/50">
                   <h3 className="text-lg font-semibold mb-2 text-foreground/80">Uploaded Image</h3>
                   <Image
                     src={imagePreview}
                     alt="Uploaded eye"
                     width={150}
                     height={150}
                     className="rounded-md object-cover max-h-[150px] w-auto"
                     data-ai-hint="eye scan"
                   />
                 </div>
              )}

              {predictionResult && (
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-accent">Initial Image Analysis (Raw Model Output)</h3>
                  <ul className="space-y-1">
                    {predictionResult.map((p, index) => (
                      <li key={index} className="text-sm p-2 bg-muted/30 rounded-md">
                        <span className="font-medium">{p.className}:</span> {(p.probability * 100).toFixed(2)}%
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {rawOutputForViz.className && rawOutputForViz.score !== null && (
                <RiskVisualizationDisplay modelClassName={rawOutputForViz.className} modelScore={rawOutputForViz.score} />
              )}

              {aiInterpretation && (
                <div className="space-y-4 mt-6">
                  <div>
                    <h3 className="text-xl font-semibold text-accent">AI-Powered Interpretation</h3>
                    <p className="text-foreground/90 leading-relaxed">{aiInterpretation.interpretation}</p>
                  </div>
                  {/* The AI's own visualization text (aiInterpretation.visualization) can be optionally displayed if needed.
                      Currently, RiskVisualizationDisplay provides the primary visual.
                      Example: <p className="text-sm text-muted-foreground">{aiInterpretation.visualization}</p> 
                  */}
                  <div>
                    <h3 className="text-xl font-semibold text-accent">Recommended Next Steps</h3>
                    <p className="text-foreground/90 leading-relaxed whitespace-pre-line">{aiInterpretation.nextSteps}</p>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleExportPdf}
                disabled={isLoading}
                className="w-full text-lg py-6 mt-4"
                variant="outline"
              >
                {isLoading && loadingMessage.startsWith("Generating PDF") ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <FileDown className="mr-2 h-5 w-5" />
                )}
                {isLoading ? loadingMessage : "Export Report as PDF"}
              </Button>
            </CardFooter>
          </Card>
        )}
      </main>

      <section className="w-full max-w-4xl mx-auto mt-16 px-4">
        <h2 className="text-3xl font-semibold text-primary mb-8 text-center">Meet the Team</h2>
        <div className="grid md:grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="shadow-lg">
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4">
                {/* 
                  TODO: Replace placeholder with your actual image.
                  1. Place s01.jpg in the `public/images/` directory.
                  2. Update src to "/images/s01.jpg".
                */}
                <Image 
                  src="https://placehold.co/80x80.png" 
                  alt="Mrs. Nethmi Weerasingha" 
                  width={80} 
                  height={80} 
                  className="rounded-full flex-shrink-0"
                  data-ai-hint="woman academic" 
                />
                <div className="text-center sm:text-left">
                  <CardTitle className="text-xl">Mrs. Nethmi Weerasingha</CardTitle>
                  <CardDescription>Project Supervisor</CardDescription>
                  <CardDescription>Lecturer at NSBM Green University - Sri Lanka</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="mt-1">
              <p className="text-sm text-muted-foreground">
                This project was developed under the expert guidance and supervision of Mrs. Nethmi Weerasingha. Her expertise in medical imaging and artificial intelligence has been instrumental in the development of AlzEyePredict.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                With extensive experience in ophthalmology and neurodegenerative disease research, she has provided invaluable insights that have shaped the direction and implementation of this project, ensuring its scientific validity and clinical relevance.
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4">
                {/* 
                  TODO: Replace placeholder with your actual image.
                  1. Place m01.jpg in the `public/images/` directory.
                  2. Update src to "/images/m01.jpg".
                */}
                <Image 
                  src="https://placehold.co/80x80.png" 
                  alt="Himasha Hansani Samarathunga" 
                  width={80} 
                  height={80} 
                  className="rounded-full flex-shrink-0"
                  data-ai-hint="woman developer"
                />
                <div className="text-center sm:text-left">
                  <CardTitle className="text-xl">Himasha Hansani Samarathunga</CardTitle>
                  <CardDescription>Model Developer</CardDescription>
                  <CardDescription>BSc.(Honors) Data Science, University of Plymouth - UK</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="mt-1">
              <p className="text-sm text-muted-foreground">
                As the model developer of AlzEyePredict, I designed and implemented the AI algorithms that power this application. Working under the guidance of Mrs. Nethmi Weerasingha, I focused on creating a reliable and accurate system for detecting Alzheimer's risk factors through eye image analysis.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                My work involved researching the correlation between glaucoma and Alzheimer's disease, developing the machine learning models, and integrating them into a user-friendly application that can be used by healthcare professionals and researchers.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="w-full max-w-4xl mt-16 text-center"> 
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} AlzEyePredict. All rights reserved. This tool is for informational purposes only and not a substitute for professional medical advice.
        </p>
      </footer>
    </div>
  );
}

