"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Linkedin, 
  Copy, 
  Check, 
  RefreshCw, 
  Sparkles,
  Hash,
  TrendingUp,
  Users,
  AlertCircle
} from "lucide-react";
import { Asset } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface LinkedInPost {
  content: string;
  hashtags: string[];
  hook: string;
  cta: string;
  characterCount: number;
  estimatedEngagement: "high" | "medium" | "low";
  reasoning: string;
}

interface LinkedInPostGeneratorProps {
  asset: Asset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LINKEDIN_CHAR_LIMIT = 3000;
const OPTIMAL_CHAR_RANGE = { min: 500, max: 1200 };

export function LinkedInPostGenerator({
  asset,
  open,
  onOpenChange,
}: LinkedInPostGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPosts, setGeneratedPosts] = useState<LinkedInPost[]>([]);
  const [selectedPostIndex, setSelectedPostIndex] = useState<number>(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [editedPost, setEditedPost] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const currentPost = generatedPosts[selectedPostIndex];
  const displayPost = editedPost || currentPost?.content || "";

  const charCount = displayPost.length;
  const isOptimalLength = charCount >= OPTIMAL_CHAR_RANGE.min && charCount <= OPTIMAL_CHAR_RANGE.max;
  const isOverLimit = charCount > LINKEDIN_CHAR_LIMIT;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setEditedPost("");
    setSelectedPostIndex(0);

    try {
      const response = await fetch("/api/linkedin/generate-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assetId: asset.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate LinkedIn post");
      }

      const data = await response.json();
      setGeneratedPosts(data.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate post");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (content: string, index: number) => {
    try {
      const fullContent = currentPost?.hashtags?.length
        ? `${content}\n\n${currentPost.hashtags.map(tag => `#${tag}`).join(" ")}`
        : content;
      
      await navigator.clipboard.writeText(fullContent);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Linkedin className="h-5 w-5 text-blue-600" />
            Create LinkedIn Post
          </DialogTitle>
          <DialogDescription>
            Generate an engaging LinkedIn post from &quot;{asset.title}&quot; targeting {asset.icpTargets.join(", ")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <Card className="bg-muted/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Asset Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Target Audience:</span>
                <div className="flex flex-wrap gap-1">
                  {asset.icpTargets.map((icp, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {icp}
                    </Badge>
                  ))}
                </div>
              </div>
              {asset.painClusters.length > 0 && (
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">Pain Points:</span>
                  <div className="flex flex-wrap gap-1">
                    {asset.painClusters.map((pain, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {pain}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {asset.outreachTip && (
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Outreach Hook:</p>
                  <p className="text-sm italic">&quot;{asset.outreachTip}&quot;</p>
                </div>
              )}
            </CardContent>
          </Card>

          {generatedPosts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="p-4 rounded-full bg-blue-50">
                <Sparkles className="h-8 w-8 text-blue-600" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-semibold">Generate LinkedIn Post</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Create high-authority B2B LinkedIn posts that establish thought leadership and drive clicks to your asset
                </p>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={isGenerating}
                size="lg"
                className="gap-2"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Post
                  </>
                )}
              </Button>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {generatedPosts.length > 0 && (
            <div className="space-y-4">
              {generatedPosts.length > 1 && (
                <Tabs
                  value={selectedPostIndex.toString()}
                  onValueChange={(val) => {
                    setSelectedPostIndex(parseInt(val));
                    setEditedPost("");
                  }}
                >
                  <TabsList className="grid w-full grid-cols-3">
                    {generatedPosts.map((post, idx) => (
                      <TabsTrigger key={idx} value={idx.toString()}>
                        Variation {idx + 1}
                        {post.estimatedEngagement === "high" && (
                          <Badge variant="outline" className="ml-2 text-xs bg-green-50 text-green-700 border-green-200">
                            High
                          </Badge>
                        )}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}

              {currentPost && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          currentPost.estimatedEngagement === "high"
                            ? "bg-green-50 text-green-700 border-green-200"
                            : currentPost.estimatedEngagement === "medium"
                            ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                            : "bg-gray-50 text-gray-700 border-gray-200"
                        }
                      >
                        {currentPost.estimatedEngagement === "high"
                          ? "High Engagement Potential"
                          : currentPost.estimatedEngagement === "medium"
                          ? "Medium Engagement Potential"
                          : "Low Engagement Potential"}
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
                      Regenerate
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="post-content">Post Content</Label>
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={
                            isOverLimit
                              ? "text-red-600 font-semibold"
                              : isOptimalLength
                              ? "text-green-600"
                              : "text-muted-foreground"
                          }
                        >
                          {charCount} / {LINKEDIN_CHAR_LIMIT}
                        </span>
                        {isOptimalLength && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            Optimal
                          </Badge>
                        )}
                        {isOverLimit && (
                          <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                            Over Limit
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Textarea
                      id="post-content"
                      value={displayPost}
                      onChange={(e) => setEditedPost(e.target.value)}
                      placeholder="Post content will appear here..."
                      className="min-h-[200px] font-sans text-base leading-relaxed"
                      rows={10}
                    />
                    {isOverLimit && (
                      <p className="text-xs text-red-600">
                        LinkedIn posts are limited to {LINKEDIN_CHAR_LIMIT} characters. Please shorten your post.
                      </p>
                    )}
                    {!isOptimalLength && !isOverLimit && charCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        💡 Tip: B2B posts between {OPTIMAL_CHAR_RANGE.min}-{OPTIMAL_CHAR_RANGE.max} characters provide enough depth to establish authority and drive clicks
                      </p>
                    )}
                    {charCount > 0 && charCount < OPTIMAL_CHAR_RANGE.min && (
                      <p className="text-xs text-yellow-600">
                        ⚠️ This post is quite short. Consider adding more depth or specific insights to establish authority.
                      </p>
                    )}
                  </div>

                  {currentPost.hashtags && currentPost.hashtags.length > 0 && (
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Hash className="h-4 w-4" />
                        Suggested Hashtags
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {currentPost.hashtags.map((tag, idx) => (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
                            onClick={() => {
                              const hashtagText = `#${tag}`;
                              if (displayPost.includes(hashtagText)) {
                                setEditedPost(displayPost.replace(hashtagText, "").trim());
                              } else {
                                setEditedPost(`${displayPost}\n\n${hashtagText}`);
                              }
                            }}
                          >
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <Card className="bg-muted/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Post Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      {currentPost.hook && (
                        <div>
                          <p className="font-medium text-xs text-muted-foreground mb-1">Hook (First Line):</p>
                          <p className="italic">&quot;{currentPost.hook}&quot;</p>
                        </div>
                      )}
                      {currentPost.cta && (
                        <div>
                          <p className="font-medium text-xs text-muted-foreground mb-1">Call to Action:</p>
                          <p>&quot;{currentPost.cta}&quot;</p>
                        </div>
                      )}
                      {currentPost.reasoning && (
                        <div className="pt-2 border-t">
                          <p className="font-medium text-xs text-muted-foreground mb-1">Why This Should Perform:</p>
                          <p className="text-xs">{currentPost.reasoning}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => handleCopy(displayPost, selectedPostIndex)}
                      className="flex-1 gap-2"
                      variant="default"
                    >
                      {copiedIndex === selectedPostIndex ? (
                        <>
                          <Check className="h-4 w-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy Post
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditedPost("")}
                      disabled={!editedPost}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
