/**
 * @file src/components/workspace/WorkspaceProjectThumb.jsx
 * @description Komponen kartu pratinjau visual proyek pada halaman beranda Workspace (WorkspaceProjectThumb)
 */
import React, { useState, useEffect } from 'react';
import { ProjectRepository } from '../../workspace/projectRepository.jsx';
import { AssetManager } from '../../workspace/assetManager.jsx';
import { ThumbnailGenerator } from '../../workspace/thumbnailGenerator.jsx';
import { WorkspaceDB } from '../../workspace/workspaceDb.jsx';

/* ----------------------------------------------------------------------------
   2. WorkspaceUI — Full Workspace Home Screen & Modals (Section 6, 9.3, 11, 12)
   ---------------------------------------------------------------------------- */
const WorkspaceProjectThumb = ({
  project
}) => {
  const [thumbUrl, setThumbUrl] = useState('');
  useEffect(() => {
    let active = true;
    let currentObjUrl = '';
    const setBlobUrl = blob => {
      if (!active || !blob || !(blob instanceof Blob) || blob.size < 24) return;
      if (currentObjUrl) {
        try {
          URL.revokeObjectURL(currentObjUrl);
        } catch (e) {}
      }
      currentObjUrl = URL.createObjectURL(blob);
      setThumbUrl(currentObjUrl);
    };
    (async () => {
      if (!project) {
        setThumbUrl('');
        return;
      }
      if (project.thumbnail && project.thumbnail instanceof Blob && project.thumbnail.size >= 24 && project.thumbnailRenderVer === 3) {
        setBlobUrl(project.thumbnail);
        return;
      }
      if (project.thumbnail && project.thumbnail instanceof Blob && project.thumbnail.size >= 24) {
        setBlobUrl(project.thumbnail);
        return;
      }
      try {
        const docRec = await ProjectRepository.getDocumentByProject(project);
        if (!active) return;
        if (docRec && docRec.data) {
          const assets = await AssetManager.getProjectAssets(project.id);
          if (!active) return;
          const hydrated = await AssetManager.hydrateDocument(project.id, docRec.data, assets);
          if (!active) return;
          const freshBlob = await ThumbnailGenerator.generateThumbnailBlob(hydrated.doc);
          if (!active) return;
          if (freshBlob && freshBlob.size >= 24) {
            setBlobUrl(freshBlob);
            await WorkspaceDB.put('projects', {
              ...project,
              thumbnail: freshBlob,
              thumbnailRenderVer: 3
            });
            return;
          }
        }
      } catch (e) {}
      if (project.thumbnail && project.thumbnail instanceof Blob && project.thumbnail.size >= 24) {
        setBlobUrl(project.thumbnail);
      } else if (active) {
        setThumbUrl('');
      }
    })();
    return () => {
      active = false;
      if (currentObjUrl) {
        try {
          URL.revokeObjectURL(currentObjUrl);
        } catch (e) {}
      }
    };
  }, [project && project.id, project && project.thumbnail, project && project.updatedAt]);
  if (thumbUrl) {
    return <img src={thumbUrl} alt={project.name} className="ws-card-thumb-img" loading="lazy" />;
  }
  return <div className="ws-card-thumb-placeholder"><svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{
      color: 'var(--acc)',
      opacity: 0.65
    }}><path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3z M3.5 16.5 12 21l8.5-4.5 M3.5 12 12 16.5 20.5 12" /></svg></div>;
};

export { WorkspaceProjectThumb };
export default WorkspaceProjectThumb;
