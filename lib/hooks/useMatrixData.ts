import { useMemo } from 'react';
import { 
  FUNCTIONAL_AREAS, 
  SENIORITY_LEVELS,
  getJobTitleByTitle,
  FunctionalArea,
  SeniorityLevel
} from '@/lib/job-titles';
import { MatrixViewLevel } from '@/components/dashboard/MatrixViewToggle';
import { Asset, FunnelStage } from '@/lib/types';

interface MatrixRow {
  label: string;
  count: number;
  tofu: { count: number; assets: Asset[] };
  mofu: { count: number; assets: Asset[] };
  bofu: { count: number; assets: Asset[] };
  retention: { count: number; assets: Asset[] };
}

export function useMatrixData(assets: Asset[], viewLevel: MatrixViewLevel): MatrixRow[] {
  return useMemo(() => {
    if (viewLevel === 'title') {
      // Original granular view - group by exact job title
      return getMatrixByTitle(assets);
    } else if (viewLevel === 'function') {
      // Rolled up by functional area
      return getMatrixByFunction(assets);
    } else {
      // Rolled up by seniority
      return getMatrixBySeniority(assets);
    }
  }, [assets, viewLevel]);
}

function getMatrixByTitle(assets: Asset[]): MatrixRow[] {
  const titleMap = new Map<string, MatrixRow>();
  
  for (const asset of assets) {
    for (const title of asset.icpTargets) {
      if (!titleMap.has(title)) {
        titleMap.set(title, createEmptyRow(title));
      }
      const row = titleMap.get(title)!;
      addAssetToRow(row, asset);
    }
  }
  
  return Array.from(titleMap.values()).sort((a, b) => b.count - a.count);
}

function getMatrixByFunction(assets: Asset[]): MatrixRow[] {
  const fnMap = new Map<FunctionalArea, MatrixRow>();
  
  // Initialize all functions
  for (const fn of FUNCTIONAL_AREAS) {
    fnMap.set(fn, createEmptyRow(fn));
  }
  
  for (const asset of assets) {
    for (const title of asset.icpTargets) {
      const jobTitle = getJobTitleByTitle(title);
      const fn = jobTitle?.function ?? 'Other';
      const row = fnMap.get(fn as FunctionalArea)!;
      addAssetToRow(row, asset);
    }
  }
  
  return Array.from(fnMap.values())
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

function getMatrixBySeniority(assets: Asset[]): MatrixRow[] {
  const seniorityMap = new Map<SeniorityLevel, MatrixRow>();
  
  // Initialize all seniority levels
  for (const level of SENIORITY_LEVELS) {
    seniorityMap.set(level, createEmptyRow(level));
  }
  
  for (const asset of assets) {
    for (const title of asset.icpTargets) {
      const jobTitle = getJobTitleByTitle(title);
      const seniority = jobTitle?.seniority ?? 'Individual Contributor';
      const row = seniorityMap.get(seniority as SeniorityLevel)!;
      addAssetToRow(row, asset);
    }
  }
  
  return Array.from(seniorityMap.values())
    .filter(row => row.count > 0)
    .sort((a, b) => {
      // Sort by seniority level order
      const order = ['C-Suite', 'VP/Director', 'Manager', 'Individual Contributor', 'Entry Level'];
      const aIndex = order.indexOf(a.label);
      const bIndex = order.indexOf(b.label);
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      return b.count - a.count;
    });
}

function createEmptyRow(label: string): MatrixRow {
  return {
    label,
    count: 0,
    tofu: { count: 0, assets: [] },
    mofu: { count: 0, assets: [] },
    bofu: { count: 0, assets: [] },
    retention: { count: 0, assets: [] }
  };
}

function addAssetToRow(row: MatrixRow, asset: Asset) {
  row.count++;
  
  // Map FunnelStage to row property
  // Deduplicate assets - only add if not already in the array (by asset ID)
  if (asset.funnelStage === 'TOFU_AWARENESS') {
    row.tofu.count++;
    if (!row.tofu.assets.find(a => a.id === asset.id)) {
      row.tofu.assets.push(asset);
    }
  } else if (asset.funnelStage === 'MOFU_CONSIDERATION') {
    row.mofu.count++;
    if (!row.mofu.assets.find(a => a.id === asset.id)) {
      row.mofu.assets.push(asset);
    }
  } else if (asset.funnelStage === 'BOFU_DECISION') {
    row.bofu.count++;
    if (!row.bofu.assets.find(a => a.id === asset.id)) {
      row.bofu.assets.push(asset);
    }
  } else if (asset.funnelStage === 'RETENTION') {
    row.retention.count++;
    if (!row.retention.assets.find(a => a.id === asset.id)) {
      row.retention.assets.push(asset);
    }
  }
}
