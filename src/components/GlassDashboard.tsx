import { useState } from 'react';
import {
  Scissors,
  Copy,
  Edit3,
  RefreshCw,
  Shield,
  Lock,
  Sparkles,
  RotateCw,
  ListOrdered,
  Hash,
  Images,
  FileImage,
  FileType,
  Crop,
} from "lucide-react";
import { GlassPDFCard } from "./GlassPDFCard";
import { Button } from "@/components/ui/button";
import { SplitTool } from './tools/SplitTool';
import { MergeTool } from './tools/MergeTool';
import { UnlockTool } from './tools/UnlockTool';
import { ProtectTool } from './tools/ProtectTool';
import { EditTool } from './tools/EditTool';
import { AddWatermarkTool } from './tools/AddWatermarkTool';
import { ConvertTool } from './tools/ConvertTool';
import { RotateTool } from './tools/RotateTool';
import { RearrangeTool } from './tools/RearrangeTool';
import { PageNumbersTool } from './tools/PageNumbersTool';
import { ExtractImagesTool } from './tools/ExtractImagesTool';
import { PdfToImagesTool } from './tools/PdfToImagesTool';
import { ExtractTextTool } from './tools/ExtractTextTool';
import { CropResizeTool } from './tools/CropResizeTool';

const pdfTools = [
  {
    id: "split",
    title: "Split PDF",
    description: "Extract pages or divide documents with surgical precision.",
    icon: Scissors,
  },
  {
    id: "merge",
    title: "Merge PDF",
    description: "Combine multiple PDF documents into a single file.",
    icon: Copy,
  },
  {
    id: "edit",
    title: "Edit Metadata",
    description: "Modify your PDF's title, author, subject, and keywords.",
    icon: Edit3,
  },
  {
    id: "convert",
    title: "Convert to PDF",
    description: "Convert JPG, PNG, or DOCX files to PDF format.",
    icon: RefreshCw,
  },
  {
    id: "unlock",
    title: "Unlock PDF",
    description: "Remove password protection from encrypted PDF files.",
    icon: Shield,
  },
  {
    id: "protect",
    title: "Protect PDF",
    description: "Add a password so only someone who knows it can open the file.",
    icon: Lock,
  },
  {
    id: "watermark",
    title: "Add Watermark",
    description: "Apply a text watermark to every page of your PDF.",
    icon: Sparkles,
  },
  {
    id: "rotate",
    title: "Rotate Pages",
    description: "Rotate selected pages by 90°, 180°, or 270°.",
    icon: RotateCw,
  },
  {
    id: "rearrange",
    title: "Delete / Reorder",
    description: "Keep pages in a custom order; omit pages to delete them.",
    icon: ListOrdered,
  },
  {
    id: "pagenumbers",
    title: "Add Page Numbers",
    description: "Stamp sequential or Bates numbers onto every page.",
    icon: Hash,
  },
  {
    id: "extractimages",
    title: "Extract Images",
    description: "Pull the embedded images out of a PDF, without changing it.",
    icon: Images,
  },
  {
    id: "pdftoimages",
    title: "PDF to Images",
    description: "Render pages to PNG, with a thumbnail preview.",
    icon: FileImage,
  },
  {
    id: "extracttext",
    title: "Extract Text",
    description: "Pull the text out of a PDF as a plain text file.",
    icon: FileType,
  },
  {
    id: "cropresize",
    title: "Crop / Resize Pages",
    description: "Trim margins non-destructively, or rescale pages to a target size.",
    icon: Crop,
  },
];

export const GlassDashboard = () => {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const handleToolClick = (toolId: string) => {
    setActiveTool(toolId);
  };

  return (
    <div className="min-h-screen bg-gradient-bg relative overflow-hidden">
      <div className="container mx-auto px-6 py-16 relative z-10">
        {/* Hero section with glassmorphism */}
        <div className="text-center mb-20 animate-scale-in">
          <div className="inline-flex items-center space-x-2 bg-glass-bg backdrop-blur-sm border border-glass-border rounded-full px-4 py-2 mb-6">
            <Sparkles className="h-4 w-4 text-primary-soft" />
            <span className="text-sm font-medium text-muted-foreground">Professional PDF Tools</span>
          </div>
          
          <h2 className="text-5xl md:text-6xl font-display font-bold text-foreground mb-6 leading-tight">
            Choose Your
            <span className="block bg-gradient-warm bg-clip-text text-transparent">
              PDF Tool
            </span>
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Professional-grade document processing with stunning visual feedback. 
            Every operation is performed locally for <span className="text-primary-soft font-medium">maximum security</span> and speed.
          </p>
        </div>

        {activeTool ? (
          <div>
            <Button
              type="button"
              variant="ghost"
              className="mb-4"
              onClick={() => setActiveTool(null)}
              aria-label="Back to Tools"
            >
              Back to Tools
            </Button>
            {activeTool === 'split' && <SplitTool />}
            {activeTool === 'merge' && <MergeTool />}
            {activeTool === 'unlock' && <UnlockTool />}
            {activeTool === 'protect' && <ProtectTool />}
            {activeTool === 'edit' && <EditTool />}
            {activeTool === 'convert' && <ConvertTool />}
            {activeTool === 'watermark' && <AddWatermarkTool />}
            {activeTool === 'rotate' && <RotateTool />}
            {activeTool === 'rearrange' && <RearrangeTool />}
            {activeTool === 'pagenumbers' && <PageNumbersTool />}
            {activeTool === 'extractimages' && <ExtractImagesTool />}
            {activeTool === 'pdftoimages' && <PdfToImagesTool />}
            {activeTool === 'extracttext' && <ExtractTextTool />}
            {activeTool === 'cropresize' && <CropResizeTool />}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto mb-16">
            {pdfTools.map((tool, index) => (
              <GlassPDFCard
                key={tool.id}
                title={tool.title}
                description={tool.description}
                icon={tool.icon}
                onClick={() => handleToolClick(tool.id)}
                delay={index * 100}
              />
            ))}
          </div>
        )}

        {/* Security badge */}
        <div className="text-center">
          <div className="inline-flex items-center space-x-3 bg-glass-bg backdrop-blur-sm border border-glass-border rounded-2xl px-6 py-4 shadow-glass">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-warm rounded-lg blur-sm opacity-40"></div>
              <div className="relative rounded-lg bg-glass-bg backdrop-blur-sm border border-glass-border p-2">
                <Shield className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">100% Offline Processing</p>
              <p className="text-xs text-muted-foreground">Your files never leave your device</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
