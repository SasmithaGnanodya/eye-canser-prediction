
import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google'; // Corrected import: Geist_Sans to Geist
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Added Toaster for notifications

const geistSans = Geist({ // Corrected: Geist_Sans to Geist
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'AlzEyePredict - AI Alzheimer’s Risk Predictor',
  description: 'Predict Alzheimer’s disease risk using glaucoma detection from eye images, powered by AI.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster /> {/* Added Toaster component here */}
      </body>
    </html>
  );
}
