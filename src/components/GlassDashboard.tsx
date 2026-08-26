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
  FileArchive,
  Crop,
  Eraser,
  GitCompare,
  Signature,
  ClipboardList,
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
import { CompressTool } from './tools/CompressTool';
import { CropResizeTool } from './tools/CropResizeTool';
import { RedactTool } from './tools/RedactTool';
import { CompareTool } from './tools/CompareTool';
import { SignatureTool } from './tools/SignatureTool';
import { FillFormTool } from './tools/FillFormTool';

/**
 * Grouping the tools by category (F-23) — reduces the dashboard to a
 * handful of cards per screen instead of one long scroll, without changing
 * any card's own look. Order here is also tab order.
 */
const CATEGORIES = ["Organize Pages", "Security", "Convert & Export", "Edit & Enhance"] as const;
type Category = (typeof CATEGORIES)[number];

const pdfTools: { id: string; title: string; description: string; icon: typeof Scissors; category: Category }[] = [
  {
    id: "split",
    title: "Split PDF",
    description: "Extract pages or divide documents with surgical precision.",
    icon: Scissors,
    category: "Organize Pages",
  },
  {
    id: "merge",
    title: "Merge PDF",
    description: "Combine multiple PDF documents into a single file.",
    icon: Copy,
    category: "Organize Pages",
  },
  {
    id: "rotate",
    title: "Rotate Pages",
    description: "Rotate selected pages by 90°, 180°, or 270°.",
    icon: RotateCw,
    category: "Organize Pages",
  },
  {
    id: "rearrange",
    title: "Delete / Reorder",
    description: "Keep pages in a custom order; omit pages to delete them.",
    icon: ListOrdered,
    category: "Organize Pages",
  },
  {
    id: "cropresize",
    title: "Crop / Resize Pages",
    description: "Trim margins non-destructively, or rescale pages to a target size.",
    icon: Crop,
    category: "Organize Pages",
  },
  {
    id: "protect",
    title: "Protect PDF",
    description: "Add a password so only someone who knows it can open the file.",
    icon: Lock,
    category: "Security",
  },
  {
    id: "unlock",
    title: "Unlock PDF",
    description: "Remove password protection from encrypted PDF files.",
    icon: Shield,
    category: "Security",
  },
  {
    id: "redact",
    title: "Redact PDF",
    description: "Permanently remove content under boxes you draw — deleted, not just covered.",
    icon: Eraser,
    category: "Security",
  },
  {
    id: "convert",
    title: "Convert to PDF",
    description: "Convert JPG, PNG, or DOCX files to PDF format.",
    icon: RefreshCw,
    category: "Convert & Export",
  },
  {
    id: "pdftoimages",
    title: "PDF to Images",
    description: "Render pages to PNG, with a thumbnail preview.",
    icon: FileImage,
    category: "Convert & Export",
  },
  {
    id: "extractimages",
    title: "Extract Images",
    description: "Pull the embedded images out of a PDF, without changing it.",
    icon: Images,
    category: "Convert & Export",
  },
  {
    id: "extracttext",
    title: "Extract Text",
    description: "Pull the text out of a PDF as a plain text file.",
    icon: FileType,
    category: "Convert & Export",
  },
  {
    id: "compare",
    title: "Compare PDFs",
    description: "Find what changed between two versions — page by page, text and visual.",
    icon: GitCompare,
    category: "Convert & Export",
  },
  {
    id: "edit",
    title: "Edit Metadata",
    description: "Modify your PDF's title, author, subject, and keywords.",
    icon: Edit3,
    category: "Edit & Enhance",
  },
  {
    id: "watermark",
    title: "Add Watermark",
    description: "Apply a text watermark to every page of your PDF.",
    icon: Sparkles,
    category: "Edit & Enhance",
  },
  {
    id: "pagenumbers",
    title: "Add Page Numbers",
    description: "Stamp sequential or Bates numbers onto every page.",
    icon: Hash,
    category: "Edit & Enhance",
  },
  {
    id: "compress",
    title: "Compress PDF",
    description: "Shrink a PDF, mainly by recompressing its embedded images.",
    icon: FileArchive,
    category: "Edit & Enhance",
  },
  {
    id: "signature",
    title: "Add Signature",
    description: "Type, draw, or upload a signature and place it on a page.",
    icon: Signature,
    category: "Edit & Enhance",
  },
  {
    id: "fillforms",
    title: "Fill PDF Forms",
    description: "Fill in text fields, checkboxes, dropdowns, and radio buttons, then download the result.",
    icon: ClipboardList,
    category: "Edit & Enhance",
  },
];

export const GlassDashboard = () => {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>(CATEGORIES[0]);
  const handleToolClick = (toolId: string) => {
    setActiveTool(toolId);
  };
  const visibleTools = pdfTools.filter((tool) => tool.category === activeCategory);

  return (
    <div className="min-h-screen bg-gradient-bg relative overflow-hidden">
      <div className="container mx-auto px-6 py-16 relative z-10">
        {/* Hero section with glassmorphism */}
        <div className="text-center mb-20 animate-scale-in">
          <div className="inline-flex items-center space-x-2 bg-glass-bg backdrop-blur-xs border border-glass-border rounded-full px-4 py-2 mb-6">
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
            {activeTool === 'compare' && <CompareTool />}
            {activeTool === 'compress' && <CompressTool />}
            {activeTool === 'cropresize' && <CropResizeTool />}
            {activeTool === 'redact' && <RedactTool />}
            {activeTool === 'signature' && <SignatureTool />}
            {activeTool === 'fillforms' && <FillFormTool />}
          </div>
        ) : (
          <div className="max-w-7xl mx-auto mb-16">
            <div className="flex flex-wrap justify-center gap-3 mb-10" data-testid="category-tabs">
              {CATEGORIES.map((category) => {
                const count = pdfTools.filter((t) => t.category === category).length;
                const isActive = category === activeCategory;
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setActiveCategory(category)}
                    className={
                      "rounded-xl px-5 py-3 text-sm font-medium transition-all duration-200 border " +
                      (isActive
                        ? "bg-gradient-warm text-background border-transparent font-semibold"
                        : "bg-glass-bg/10 backdrop-blur-xs border-glass-border text-muted-foreground hover:text-foreground hover:border-glass-border/80")
                    }
                  >
                    {category}
                    <span className="ml-2 opacity-60 text-xs">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {visibleTools.map((tool, index) => (
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
          </div>
        )}

        {/* Security badge */}
        <div className="text-center">
          <div className="inline-flex items-center space-x-3 bg-glass-bg backdrop-blur-xs border border-glass-border rounded-2xl px-6 py-4 shadow-glass">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-warm rounded-lg blur-xs opacity-40"></div>
              <div className="relative rounded-lg bg-glass-bg backdrop-blur-xs border border-glass-border p-2">
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
