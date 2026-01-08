"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, DollarSign, TrendingUp } from "lucide-react";

interface KeywordWithMatches {
  keyword: string;
  volume: number;
  cpc: number;
  competition: string;
  adGroupSuggestion?: string;
  estimatedMonthlySpend?: number;
}

interface AdGroupOrganizerProps {
  keywords: KeywordWithMatches[];
  adGroups: Map<string, KeywordWithMatches[]>;
  onAdGroupsChange: (groups: Map<string, KeywordWithMatches[]>) => void;
}

export function AdGroupOrganizer({
  keywords,
  adGroups,
  onAdGroupsChange,
}: AdGroupOrganizerProps) {
  const [newGroupName, setNewGroupName] = React.useState("");
  const [editingGroup, setEditingGroup] = React.useState<string | null>(null);
  const [groupNames, setGroupNames] = React.useState<Map<string, string>>(new Map());

  // Initialize group names from current ad groups
  React.useEffect(() => {
    const names = new Map<string, string>();
    adGroups.forEach((keywords, groupName) => {
      names.set(groupName, groupName);
    });
    setGroupNames(names);
  }, []);

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;

    const newGroups = new Map(adGroups);
    newGroups.set(newGroupName.trim(), []);
    setGroupNames((prev) => {
      const updated = new Map(prev);
      updated.set(newGroupName.trim(), newGroupName.trim());
      return updated;
    });
    onAdGroupsChange(newGroups);
    setNewGroupName("");
  };

  const handleDeleteGroup = (groupName: string) => {
    const newGroups = new Map(adGroups);
    newGroups.delete(groupName);
    setGroupNames((prev) => {
      const updated = new Map(prev);
      updated.delete(groupName);
      return updated;
    });
    onAdGroupsChange(newGroups);
  };

  const handleRenameGroup = (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) {
      setEditingGroup(null);
      return;
    }

    const newGroups = new Map(adGroups);
    const keywords = newGroups.get(oldName) || [];
    newGroups.delete(oldName);
    newGroups.set(newName.trim(), keywords);
    
    setGroupNames((prev) => {
      const updated = new Map(prev);
      updated.delete(oldName);
      updated.set(newName.trim(), newName.trim());
      return updated;
    });
    onAdGroupsChange(newGroups);
    setEditingGroup(null);
  };

  const handleRemoveKeyword = (groupName: string, keyword: string) => {
    const newGroups = new Map(adGroups);
    const keywords = newGroups.get(groupName) || [];
    const updated = keywords.filter((k) => k.keyword !== keyword);
    if (updated.length === 0) {
      newGroups.delete(groupName);
    } else {
      newGroups.set(groupName, updated);
    }
    onAdGroupsChange(newGroups);
  };

  const handleMoveKeyword = (fromGroup: string, keyword: KeywordWithMatches, toGroup: string) => {
    const newGroups = new Map(adGroups);
    
    // Remove from source group
    const sourceKeywords = newGroups.get(fromGroup) || [];
    const updatedSource = sourceKeywords.filter((k) => k.keyword !== keyword.keyword);
    if (updatedSource.length === 0) {
      newGroups.delete(fromGroup);
    } else {
      newGroups.set(fromGroup, updatedSource);
    }
    
    // Add to target group
    const targetKeywords = newGroups.get(toGroup) || [];
    if (!targetKeywords.find((k) => k.keyword === keyword.keyword)) {
      targetKeywords.push(keyword);
      newGroups.set(toGroup, targetKeywords);
    }
    
    onAdGroupsChange(newGroups);
  };

  const calculateGroupSpend = (keywords: KeywordWithMatches[]) => {
    return keywords.reduce((sum, kw) => sum + (kw.estimatedMonthlySpend || 0), 0);
  };

  const unassignedKeywords = keywords.filter((kw) => {
    for (const groupKeywords of adGroups.values()) {
      if (groupKeywords.find((k) => k.keyword === kw.keyword)) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium">Organize Keywords into Ad Groups</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Group related keywords together. Each ad group should target a similar intent and product line.
        </p>
      </div>

      {/* Create New Group */}
      <div className="flex gap-2">
        <Input
          placeholder="New ad group name..."
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleCreateGroup();
            }
          }}
          className="flex-1"
        />
        <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()}>
          <Plus className="h-4 w-4 mr-2" />
          Create Group
        </Button>
      </div>

      {/* Ad Groups */}
      <div className="space-y-4">
        {Array.from(adGroups.entries()).map(([groupName, groupKeywords]) => {
          const displayName = groupNames.get(groupName) || groupName;
          const totalSpend = calculateGroupSpend(groupKeywords);
          
          return (
            <Card key={groupName}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  {editingGroup === groupName ? (
                    <Input
                      value={displayName}
                      onChange={(e) => {
                        setGroupNames((prev) => {
                          const updated = new Map(prev);
                          updated.set(groupName, e.target.value);
                          return updated;
                        });
                      }}
                      onBlur={() => handleRenameGroup(groupName, groupNames.get(groupName) || groupName)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleRenameGroup(groupName, groupNames.get(groupName) || groupName);
                        } else if (e.key === "Escape") {
                          setEditingGroup(null);
                        }
                      }}
                      autoFocus
                      className="flex-1 max-w-md"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{displayName}</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingGroup(groupName)}
                        className="h-6 px-2 text-xs"
                      >
                        Rename
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-muted-foreground">
                      {groupKeywords.length} keyword{groupKeywords.length !== 1 ? "s" : ""}
                    </div>
                    <div className="flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400">
                      <DollarSign className="h-4 w-4" />
                      {totalSpend.toFixed(0)}/mo
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteGroup(groupName)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {groupKeywords.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No keywords in this group. Drag keywords here or use the dropdown below.
                    </p>
                  ) : (
                    groupKeywords.map((kw, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 border rounded-md hover:bg-muted/50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{kw.keyword}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Vol: {kw.volume.toLocaleString()} • CPC: ${kw.cpc.toFixed(2)} • {kw.competition}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={groupName}
                            onChange={(e) => {
                              if (e.target.value !== groupName) {
                                handleMoveKeyword(groupName, kw, e.target.value);
                              }
                            }}
                            className="text-xs border rounded px-2 py-1"
                          >
                            <option value={groupName}>Move to...</option>
                            {Array.from(adGroups.keys())
                              .filter((name) => name !== groupName)
                              .map((name) => (
                                <option key={name} value={name}>
                                  {groupNames.get(name) || name}
                                </option>
                              ))}
                            {unassignedKeywords.length > 0 && (
                              <option value="__unassigned__">Unassigned</option>
                            )}
                          </select>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveKeyword(groupName, kw.keyword)}
                            className="h-7 w-7 p-0"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Unassigned Keywords */}
      {unassignedKeywords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unassigned Keywords</CardTitle>
            <CardDescription>
              {unassignedKeywords.length} keyword{unassignedKeywords.length !== 1 ? "s" : ""} not in any ad group
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {unassignedKeywords.map((kw, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 border rounded-md"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{kw.keyword}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Vol: {kw.volume.toLocaleString()} • CPC: ${kw.cpc.toFixed(2)}
                    </div>
                  </div>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleMoveKeyword("__unassigned__", kw, e.target.value);
                      }
                    }}
                    className="text-xs border rounded px-2 py-1"
                  >
                    <option value="">Add to group...</option>
                    {Array.from(adGroups.keys()).map((name) => (
                      <option key={name} value={name}>
                        {groupNames.get(name) || name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campaign Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-sm text-muted-foreground">Ad Groups</div>
              <div className="text-2xl font-bold">{adGroups.size}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Keywords</div>
              <div className="text-2xl font-bold">
                {Array.from(adGroups.values()).reduce((sum, kw) => sum + kw.length, 0)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Est. Monthly Spend</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                $
                {Array.from(adGroups.values())
                  .reduce((sum, kw) => sum + calculateGroupSpend(kw), 0)
                  .toFixed(0)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
