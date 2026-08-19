import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { KbItemSummary, KbItemDetail } from '../types';
import {
  SearchIcon,
  CheckIcon,
  CheckCircleIcon,
  ClockIcon,
  UndoIcon,
  TrashIcon,
  CopyIcon,
  ExternalLinkIcon,
  SparklesIcon,
  FileTextIcon,
  MessageSquareIcon,
  GitHubIcon,
  XIcon,
  AlertTriangleIcon,
  RefreshIcon,
  ImageIcon,
  MicIcon,
  PlayIcon,
  PauseIcon,
  GridIcon,
  KanbanIcon,
  TableIcon,
  CheckSquareIcon,
  StarIcon
} from './Icons';
import { FormattedText } from './FormattedText';
import { StarRating } from './StarRating';

interface Props {
  items: KbItemSummary[];
  onRefresh: () => void;
  inboxTitle?: string;
}

type ViewMode = 'grid' | 'kanban' | 'table';
type SortOption = 'newest' | 'oldest' | 'title' | 'highest_rated' | 'lowest_rated';

export const KbBrowser: React.FC<Props> = ({ items, onRefresh, inboxTitle = 'To Do Inbox' }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNREAD' | 'DONE'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Multi-select batch operations
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [batchDeleteFromWa, setBatchDeleteFromWa] = useState(false);

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [itemDetail, setItemDetail] = useState<KbItemDetail | null>(null);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<'rich' | 'raw'>('rich');

  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedRaw, setCopiedRaw] = useState(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [deleteFromWaOnDelete, setDeleteFromWaOnDelete] = useState(false);
  const [completingSlug, setCompletingSlug] = useState<string | null>(null);
  const [completingRating, setCompletingRating] = useState<number>(5);
  const [deleteFromWaOnComplete, setDeleteFromWaOnComplete] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (deletingSlug) {
          setDeletingSlug(null);
        } else if (completingSlug) {
          setCompletingSlug(null);
        } else if (selectedSlug) {
          setSelectedSlug(null);
        } else if (selectionMode) {
          setSelectedSlugs(new Set());
          setSelectionMode(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSlug, deletingSlug, completingSlug, selectionMode]);

  // Counts for status filters
  const unreadCount = items.filter(i => i.status !== 'done').length;
  const doneCount = items.filter(i => i.status === 'done').length;

  const filtered = items
    .filter(item => {
      // 1. Status Filter
      if (statusFilter === 'UNREAD' && item.status === 'done') return false;
      if (statusFilter === 'DONE' && item.status !== 'done') return false;

      // 2. Category Filter
      if (categoryFilter !== 'ALL' && item.category.toUpperCase() !== categoryFilter.toUpperCase()) {
        return false;
      }

      // 3. Search Query (support searching with or without '#' prefix, multi-word tags, title, summary)
      if (search.trim()) {
        const rawQ = search.trim().toLowerCase();
        const cleanQ = rawQ.replace(/^#+/, '').trim();

        const matchesTags = item.tags.some(t => {
          const tagClean = t.toLowerCase().replace(/^#+/, '');
          return (
            tagClean.includes(cleanQ) ||
            tagClean.includes(rawQ) ||
            `#${tagClean}`.includes(rawQ) ||
            (cleanQ.length > 0 && cleanQ.includes(tagClean))
          );
        });

        const matchesText =
          item.title.toLowerCase().includes(rawQ) ||
          item.title.toLowerCase().includes(cleanQ) ||
          item.summary.toLowerCase().includes(rawQ) ||
          item.category.toLowerCase().includes(rawQ);

        return matchesTags || matchesText;
      }

      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.date).getTime() - new Date(a.date).getTime();
      if (sortBy === 'oldest') return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      if (sortBy === 'highest_rated') {
        const rDiff = (b.rating || 0) - (a.rating || 0);
        if (rDiff !== 0) return rDiff;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      if (sortBy === 'lowest_rated') {
        const rDiff = (a.rating || 0) - (b.rating || 0);
        if (rDiff !== 0) return rDiff;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      return 0;
    });

  const openItemDetail = async (slug: string) => {
    setSelectedSlug(slug);
    setItemDetail(null);
    setRawContent(null);
    setLoadingDetail(true);
    setActiveModalTab('rich');

    try {
      const [detailRes, rawRes] = await Promise.all([
        fetch(`/api/kb/item/${encodeURIComponent(slug)}`),
        fetch(`/api/kb/raw/${encodeURIComponent(slug)}`)
      ]);

      if (detailRes.ok) {
        const data = await detailRes.json();
        const parsed = data?.item || data;
        setItemDetail(parsed);
        if (parsed?.rawContent) {
          setRawContent(parsed.rawContent);
        }
      }
      if (rawRes.ok) {
        const rawText = await rawRes.text();
        if (rawText) {
          setRawContent(rawText);
        }
      }
    } catch {
      showToast('Error loading note details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const executeToggleStatus = async (
    slug: string,
    newStatus: 'unread' | 'done',
    deleteFromWhatsApp: boolean = false,
    rating?: number | null
  ) => {
    try {
      const res = await fetch(`/api/kb/item/${encodeURIComponent(slug)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          rating,
          deleteFromWhatsApp,
          deleteMode: 'clear_for_me'
        })
      });

      if (res.ok) {
        showToast(
          newStatus === 'done'
            ? deleteFromWhatsApp
              ? `Marked completed with ${rating || 5}★ & removed from WhatsApp`
              : `Marked as completed (${rating || 5}★)`
            : 'Reverted to unread'
        );

        if (itemDetail && itemDetail.slug === slug) {
          setItemDetail({
            ...itemDetail,
            status: newStatus,
            rating: newStatus === 'done' ? (rating || 5) : undefined
          });
        }
        setCompletingSlug(null);
        onRefresh();
      }
    } catch {
      showToast('Failed to update status');
    }
  };

  const handleRateItem = async (slug: string, rating: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/kb/item/${encodeURIComponent(slug)}/rating`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: rating || null })
      });

      if (res.ok) {
        showToast(rating > 0 ? `Rated task ${rating} ★` : 'Rating cleared');
        if (itemDetail && itemDetail.slug === slug) {
          setItemDetail({
            ...itemDetail,
            rating: rating > 0 ? rating : undefined
          });
        }
        onRefresh();
      }
    } catch {
      showToast('Failed to update rating');
    }
  };

  const handleToggleStatus = (slug: string, currentStatus: 'unread' | 'done', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (currentStatus === 'unread') {
      const currentItem = items.find(i => i.slug === slug);
      setCompletingRating(currentItem?.rating || 5);
      setDeleteFromWaOnComplete(false);
      setCompletingSlug(slug);
    } else {
      executeToggleStatus(slug, 'unread', false, null);
    }
  };

  const handleDeleteItem = async (slug: string, deleteFromWhatsApp: boolean = false) => {
    try {
      const res = await fetch(`/api/kb/item/${encodeURIComponent(slug)}?deleteFromWhatsApp=${deleteFromWhatsApp}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        showToast(deleteFromWhatsApp ? `Item deleted from ${inboxTitle} & WhatsApp` : 'Item deleted successfully');
        setDeletingSlug(null);
        if (selectedSlug === slug) {
          setSelectedSlug(null);
        }
        onRefresh();
      }
    } catch {
      showToast('Failed to delete item');
    }
  };

  // Batch operations
  const toggleSelectSlug = (slug: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedSlugs(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedSlugs.size === filtered.length) {
      setSelectedSlugs(new Set());
    } else {
      setSelectedSlugs(new Set(filtered.map(i => i.slug)));
    }
  };

  const handleBatchStatus = async (status: 'unread' | 'done') => {
    if (selectedSlugs.size === 0) return;
    setBatchActionLoading(true);
    try {
      const res = await fetch('/api/kb/batch-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slugs: Array.from(selectedSlugs),
          status,
          deleteFromWhatsApp: batchDeleteFromWa
        })
      });
      if (res.ok) {
        showToast(`Updated ${selectedSlugs.size} items to ${status}`);
        setSelectedSlugs(new Set());
        setSelectionMode(false);
        onRefresh();
      }
    } catch {
      showToast('Batch status update failed');
    } finally {
      setBatchActionLoading(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedSlugs.size === 0) return;
    const confirm = window.confirm(`Are you sure you want to delete ${selectedSlugs.size} items?`);
    if (!confirm) return;

    setBatchActionLoading(true);
    try {
      const res = await fetch('/api/kb/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slugs: Array.from(selectedSlugs),
          deleteFromWhatsApp: batchDeleteFromWa
        })
      });
      if (res.ok) {
        showToast(`Deleted ${selectedSlugs.size} items`);
        setSelectedSlugs(new Set());
        setSelectionMode(false);
        onRefresh();
      }
    } catch {
      showToast('Batch delete failed');
    } finally {
      setBatchActionLoading(false);
    }
  };

  const copyAiPrompt = () => {
    if (!itemDetail?.aiPromptStarter && !rawContent) return;
    const promptText = itemDetail?.aiPromptStarter || rawContent || '';
    navigator.clipboard.writeText(promptText);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
    showToast('AI Prompt copied to clipboard');
  };

  const copyRawContent = () => {
    if (!rawContent) return;
    navigator.clipboard.writeText(rawContent);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
    showToast('Raw markdown copied to clipboard');
  };

  // Grouping for Kanban view
  const kanbanInbox = filtered.filter(i => i.status !== 'done' && i.category !== 'Task');
  const kanbanTasks = filtered.filter(i => i.status !== 'done' && i.category === 'Task');
  const kanbanDone = filtered.filter(i => i.status === 'done');

  return (
    <div className="glass-card" style={{ position: 'relative' }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div className="toast-notification">
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Top Control Toolbar */}
      <div className="kb-filter-toolbar">
        {/* Status Filter Segmented Controls */}
        <div className="status-filter-group">
          <button
            className={`status-filter-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ALL')}
          >
            <span>All</span>
            <span className="filter-badge">{items.length}</span>
          </button>
          <button
            className={`status-filter-btn ${statusFilter === 'UNREAD' ? 'active' : ''}`}
            onClick={() => setStatusFilter('UNREAD')}
          >
            <span>Pending</span>
            <span className="filter-badge pending">{unreadCount}</span>
          </button>
          <button
            className={`status-filter-btn ${statusFilter === 'DONE' ? 'active' : ''}`}
            onClick={() => setStatusFilter('DONE')}
          >
            <span>Done</span>
            <span className="filter-badge done">{doneCount}</span>
          </button>
        </div>

        {/* View Mode & Selection Controls */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View Mode Switcher */}
          <div className="view-mode-group">
            <button
              className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Card Grid View"
            >
              <GridIcon size={14} />
              <span>Grid</span>
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'kanban' ? 'active' : ''}`}
              onClick={() => setViewMode('kanban')}
              title="Kanban Board View"
            >
              <KanbanIcon size={14} />
              <span>Kanban</span>
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Compact Table View"
            >
              <TableIcon size={14} />
              <span>Table</span>
            </button>
          </div>

          {/* Selection Mode Toggle */}
          <button
            className={`btn btn-secondary ${selectionMode ? 'btn-select-active' : ''}`}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
            onClick={() => {
              setSelectionMode(!selectionMode);
              if (selectionMode) setSelectedSlugs(new Set());
            }}
            title="Toggle batch selection"
          >
            <CheckSquareIcon size={14} />
            <span>{selectionMode ? 'Cancel Selection' : 'Select'}</span>
          </button>

          {/* Category & Sort Selectors */}
          <select
            className="filter-select"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            <option value="REPOSITORY">Repositories</option>
            <option value="ARTICLE">Articles</option>
            <option value="TASK">Tasks & Notes</option>
            <option value="RESEARCH">Research</option>
          </select>

          <select
            className="filter-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="title">Title (A-Z)</option>
            <option value="highest_rated">Highest Rated (★)</option>
            <option value="lowest_rated">Lowest Rated (★)</option>
          </select>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-bar-wrapper">
        <SearchIcon size={16} className="search-icon" />
        <input
          type="text"
          className="search-bar"
          placeholder="Search notes, voice memos, articles, repositories, or #tags..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="search-clear"
            onClick={() => setSearch('')}
            title="Clear search"
          >
            <XIcon size={14} />
          </button>
        )}
      </div>

      {/* Floating Batch Operations Bar */}
      {selectionMode && (
        <div className="batch-action-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="btn btn-secondary" style={{ fontSize: '0.8rem' }} onClick={toggleSelectAll}>
              {selectedSlugs.size === filtered.length ? 'Deselect All' : `Select All (${filtered.length})`}
            </button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
              {selectedSlugs.size} selected
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                className="task-checkbox"
                checked={batchDeleteFromWa}
                onChange={e => setBatchDeleteFromWa(e.target.checked)}
              />
              <span>Delete from WhatsApp too</span>
            </label>

            <button
              className="btn btn-primary"
              style={{ fontSize: '0.8rem' }}
              disabled={selectedSlugs.size === 0 || batchActionLoading}
              onClick={() => handleBatchStatus('done')}
            >
              <CheckIcon size={13} />
              <span>Mark Done ({selectedSlugs.size})</span>
            </button>

            <button
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem' }}
              disabled={selectedSlugs.size === 0 || batchActionLoading}
              onClick={() => handleBatchStatus('unread')}
            >
              <UndoIcon size={13} />
              <span>Mark Unread</span>
            </button>

            <button
              className="btn btn-danger"
              style={{ fontSize: '0.8rem' }}
              disabled={selectedSlugs.size === 0 || batchActionLoading}
              onClick={handleBatchDelete}
            >
              <TrashIcon size={13} />
              <span>Delete ({selectedSlugs.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--text-dim)' }}>
          <SearchIcon size={36} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
          <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
            No messages found
          </div>
          <p style={{ maxWidth: '400px', margin: '0 auto', fontSize: '0.85rem' }}>
            {search || statusFilter !== 'ALL' || categoryFilter !== 'ALL'
              ? 'Try adjusting your search keywords or clearing active filters.'
              : 'Import your WhatsApp chat archive or send notes and voice messages to your "To Do" chat.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* 1. GRID VIEW */
        <div className="kb-grid">
          {filtered.map(item => {
            const isDone = item.status === 'done';
            const isSelected = selectedSlugs.has(item.slug);

            return (
              <div
                key={item.id}
                className={`kb-card ${isDone ? 'kb-card-done' : ''} ${isSelected ? 'kb-card-selected' : ''}`}
                onClick={() => {
                  if (selectionMode) toggleSelectSlug(item.slug);
                  else openItemDetail(item.slug);
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      {selectionMode && (
                        <input
                          type="checkbox"
                          className="task-checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectSlug(item.slug)}
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                      <span className={`tag tag-${item.category.toLowerCase()}`}>
                        {item.category}
                      </span>
                      {item.audio && (
                        <span className="tag tag-audio" title="Voice note recording">
                          <MicIcon size={10} />
                          <span>Voice Note</span>
                        </span>
                      )}
                      <span className={`status-pill ${isDone ? 'done' : 'unread'}`}>
                        {isDone ? <CheckIcon size={12} /> : <ClockIcon size={12} />}
                        <span>{isDone ? 'Done' : 'Pending'}</span>
                      </span>
                    </div>

                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      {new Date(item.date).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 className="kb-card-title">{item.title}</h3>
                  <p className="kb-card-summary">{item.summary}</p>

                  {/* Audio preview */}
                  {item.audio && (
                    <div className="audio-card-preview" onClick={e => e.stopPropagation()}>
                      <audio controls src={item.audio} style={{ width: '100%', height: '32px', marginTop: '0.35rem' }} />
                    </div>
                  )}

                  {/* Image Thumbnail */}
                  {item.image && (
                    <div className="card-thumbnail-wrapper">
                      <img
                        src={item.image}
                        alt="Thumbnail"
                        className="card-thumbnail"
                        onError={(e) => {
                          const p = (e.target as HTMLElement).parentElement;
                          if (p) p.style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  {/* Star Rating for Completed Items */}
                  {isDone && (
                    <div className="card-rating-row" onClick={e => e.stopPropagation()}>
                      <StarRating
                        value={item.rating}
                        onChange={r => handleRateItem(item.slug, r)}
                        size={14}
                        showScoreBadge={Boolean(item.rating)}
                      />
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--bg-card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="kb-card-tags">
                    {item.tags.slice(0, 3).map(t => (
                      <span
                        key={t}
                        className="tag"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSearch(`#${t.replace(/^#+/, '')}`);
                        }}
                        title={`Filter by #${t.replace(/^#+/, '')}`}
                        style={{ cursor: 'pointer' }}
                      >
                        #{t.replace(/^#+/, '')}
                      </span>
                    ))}
                    {item.tags.length > 3 && (
                      <span className="tag tag-more">+{item.tags.length - 3}</span>
                    )}
                  </div>

                  {/* Quick Card Actions */}
                  <div className="card-quick-actions" onClick={e => e.stopPropagation()}>
                    <button
                      className={`card-action-btn ${isDone ? 'btn-done-active' : ''}`}
                      title={isDone ? 'Mark as Unread' : 'Mark as Done'}
                      onClick={e => handleToggleStatus(item.slug, item.status, e)}
                    >
                      {isDone ? <UndoIcon size={14} /> : <CheckIcon size={14} />}
                    </button>
                    <button
                      className="card-action-btn btn-delete"
                      title="Delete Item"
                      onClick={e => {
                        e.stopPropagation();
                        setDeletingSlug(item.slug);
                      }}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'kanban' ? (
        /* 2. KANBAN BOARD VIEW */
        <div className="kanban-container">
          {/* Column 1: Inbox / Content */}
          <div className="kanban-column">
            <div className="kanban-column-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="kanban-column-dot inbox" />
                <span className="kanban-column-title">Inbox / Knowledge</span>
              </div>
              <span className="filter-badge">{kanbanInbox.length}</span>
            </div>

            <div className="kanban-column-body">
              {kanbanInbox.map(item => (
                <div
                  key={item.id}
                  className="kanban-card"
                  onClick={() => openItemDetail(item.slug)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span className={`tag tag-${item.category.toLowerCase()}`}>{item.category}</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{new Date(item.date).toLocaleDateString()}</span>
                  </div>
                  <h4 className="kanban-card-title">{item.title}</h4>
                  <p className="kanban-card-summary">{item.summary}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <div className="kb-card-tags">
                      {item.tags.slice(0, 2).map(t => <span key={t} className="tag">#{t}</span>)}
                    </div>
                    <button
                      className="card-action-btn"
                      title="Mark as Completed"
                      onClick={e => handleToggleStatus(item.slug, item.status, e)}
                    >
                      <CheckIcon size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: Actionable Tasks & Notes */}
          <div className="kanban-column">
            <div className="kanban-column-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="kanban-column-dot tasks" />
                <span className="kanban-column-title">Actionable Tasks</span>
              </div>
              <span className="filter-badge pending">{kanbanTasks.length}</span>
            </div>

            <div className="kanban-column-body">
              {kanbanTasks.map(item => (
                <div
                  key={item.id}
                  className="kanban-card"
                  onClick={() => openItemDetail(item.slug)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span className="tag tag-task">Task</span>
                    {item.audio && <span className="tag tag-audio"><MicIcon size={10} /> Voice</span>}
                  </div>
                  <h4 className="kanban-card-title">{item.title}</h4>
                  <p className="kanban-card-summary">{item.summary}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <div className="kb-card-tags">
                      {item.tags.slice(0, 2).map(t => <span key={t} className="tag">#{t}</span>)}
                    </div>
                    <button
                      className="card-action-btn"
                      title="Mark Done"
                      onClick={e => handleToggleStatus(item.slug, item.status, e)}
                    >
                      <CheckIcon size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3: Completed */}
          <div className="kanban-column">
            <div className="kanban-column-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="kanban-column-dot done" />
                <span className="kanban-column-title">Completed</span>
              </div>
              <span className="filter-badge done">{kanbanDone.length}</span>
            </div>

            <div className="kanban-column-body">
              {kanbanDone.map(item => (
                <div
                  key={item.id}
                  className="kanban-card kanban-card-done"
                  onClick={() => openItemDetail(item.slug)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span className="status-pill done"><CheckIcon size={10} /> Done</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{new Date(item.date).toLocaleDateString()}</span>
                  </div>
                  <h4 className="kanban-card-title" style={{ textDecoration: 'line-through', opacity: 0.75 }}>{item.title}</h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <StarRating
                      value={item.rating}
                      onChange={r => handleRateItem(item.slug, r)}
                      size={12}
                      showScoreBadge={Boolean(item.rating)}
                    />
                    <button
                      className="card-action-btn"
                      title="Revert to Pending"
                      onClick={e => handleToggleStatus(item.slug, item.status, e)}
                    >
                      <UndoIcon size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* 3. COMPACT TABLE VIEW */
        <div className="table-responsive-container">
          <table className="kb-table">
            <thead>
              <tr>
                {selectionMode && <th style={{ width: '40px' }} />}
                <th style={{ width: '100px' }}>Status</th>
                <th>Title & Summary</th>
                <th style={{ width: '130px' }}>Rating</th>
                <th style={{ width: '120px' }}>Category</th>
                <th style={{ width: '110px' }}>Date</th>
                <th style={{ width: '80px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const isDone = item.status === 'done';
                const isSelected = selectedSlugs.has(item.slug);

                return (
                  <tr
                    key={item.id}
                    className={`kb-table-row ${isDone ? 'done-row' : ''} ${isSelected ? 'selected-row' : ''}`}
                    onClick={() => {
                      if (selectionMode) toggleSelectSlug(item.slug);
                      else openItemDetail(item.slug);
                    }}
                  >
                    {selectionMode && (
                      <td onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="task-checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectSlug(item.slug)}
                        />
                      </td>
                    )}
                    <td>
                      <span className={`status-pill ${isDone ? 'done' : 'unread'}`}>
                        {isDone ? <CheckIcon size={11} /> : <ClockIcon size={11} />}
                        <span>{isDone ? 'Done' : 'Pending'}</span>
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        {item.audio && <MicIcon size={13} style={{ color: 'var(--accent-wa)' }} />}
                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.title}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {item.summary.substring(0, 90)}...
                      </div>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      {isDone ? (
                        <StarRating
                          value={item.rating}
                          onChange={r => handleRateItem(item.slug, r)}
                          size={13}
                          showScoreBadge={Boolean(item.rating)}
                        />
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`tag tag-${item.category.toLowerCase()}`}>{item.category}</span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      {new Date(item.date).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: '0.25rem' }}>
                        <button
                          className={`card-action-btn ${isDone ? 'btn-done-active' : ''}`}
                          onClick={e => handleToggleStatus(item.slug, item.status, e)}
                        >
                          {isDone ? <UndoIcon size={13} /> : <CheckIcon size={13} />}
                        </button>
                        <button
                          className="card-action-btn btn-delete"
                          onClick={() => setDeletingSlug(item.slug)}
                        >
                          <TrashIcon size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Rich Message Detail Reader Modal */}
      {selectedSlug && createPortal(
        <div className="modal-overlay" onClick={() => setSelectedSlug(null)}>
          <div
            className="modal-content reader-modal"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="reader-modal-header">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1, paddingRight: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span
                    className={`tag tag-${(itemDetail?.category || 'task').toLowerCase()}`}
                    onClick={() => {
                      if (itemDetail?.category) {
                        setCategoryFilter(itemDetail.category.toUpperCase());
                        setSelectedSlug(null);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                    title={`Filter by category "${itemDetail?.category}"`}
                  >
                    {itemDetail?.category || 'Task'}
                  </span>

                  <span className={`status-pill ${itemDetail?.status === 'done' ? 'done' : 'unread'}`}>
                    {itemDetail?.status === 'done' ? <CheckIcon size={12} /> : <ClockIcon size={12} />}
                    <span>{itemDetail?.status === 'done' ? 'Completed' : 'Pending'}</span>
                  </span>

                  {itemDetail?.status === 'done' && (
                    <div className="reader-modal-rating-container" onClick={e => e.stopPropagation()}>
                      <StarRating
                        value={itemDetail.rating}
                        onChange={r => handleRateItem(itemDetail.slug, r)}
                        size={15}
                        showLabel={true}
                        showScoreBadge={true}
                      />
                    </div>
                  )}

                  <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <ClockIcon size={13} />
                    <span>{itemDetail?.date ? new Date(itemDetail.date).toLocaleString() : ''}</span>
                  </span>
                  {itemDetail?.sender && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      • {itemDetail.sender}
                    </span>
                  )}
                </div>

                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.35, marginTop: '0.25rem' }}>
                  {itemDetail?.title || selectedSlug}
                </h2>
              </div>

              <button
                className="btn-icon"
                title="Close (Esc)"
                onClick={() => setSelectedSlug(null)}
              >
                <XIcon size={16} />
              </button>
            </div>

            {/* Modal Action & Tab Toolbar */}
            <div className="reader-modal-toolbar">
              <div className="reader-tabs">
                <button
                  className={`reader-tab-btn ${activeModalTab === 'rich' ? 'active' : ''}`}
                  onClick={() => setActiveModalTab('rich')}
                >
                  <SparklesIcon size={14} />
                  <span>Enriched View</span>
                </button>
                <button
                  className={`reader-tab-btn ${activeModalTab === 'raw' ? 'active' : ''}`}
                  onClick={() => setActiveModalTab('raw')}
                >
                  <FileTextIcon size={14} />
                  <span>Raw Markdown</span>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {itemDetail?.url && (
                  <a
                    href={itemDetail.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', color: 'var(--accent-primary)' }}
                    title="Open Primary URL"
                  >
                    <ExternalLinkIcon size={13} />
                    <span>Open Link</span>
                  </a>
                )}

                <button
                  className={`btn ${itemDetail?.status === 'done' ? 'btn-secondary' : 'btn-primary'}`}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                  onClick={() => handleToggleStatus(selectedSlug, itemDetail?.status || 'unread')}
                >
                  {itemDetail?.status === 'done' ? <UndoIcon size={13} /> : <CheckIcon size={13} />}
                  <span>{itemDetail?.status === 'done' ? 'Revert to Pending' : 'Mark Done'}</span>
                </button>

                <button
                  className="btn btn-danger"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                  onClick={() => setDeletingSlug(selectedSlug)}
                >
                  <TrashIcon size={13} />
                  <span>Delete</span>
                </button>
              </div>
            </div>

            {/* Modal Content Body */}
            <div className="reader-modal-body">
              {loadingDetail ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                  <RefreshIcon size={24} className="spin" style={{ marginBottom: '0.5rem' }} />
                  <div>Loading note details...</div>
                </div>
              ) : activeModalTab === 'raw' ? (
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }} onClick={copyRawContent}>
                      <CopyIcon size={13} />
                      <span>{copiedRaw ? 'Copied' : 'Copy Raw Markdown'}</span>
                    </button>
                  </div>
                  <pre className="raw-markdown-pre">{rawContent || 'No raw content found.'}</pre>
                </div>
              ) : itemDetail ? (
                <div className="rich-reader-content">
                  {/* Voice Note Audio & Accurate Transcription OR Original WhatsApp Message */}
                  {itemDetail.audio ? (
                    <div className="reader-section voice-note-player-box" style={{
                      background: 'rgba(37, 211, 102, 0.05)',
                      border: '1px solid rgba(37, 211, 102, 0.25)',
                      borderRadius: '12px',
                      padding: '1.15rem'
                    }}>
                      <div className="section-label" style={{ marginBottom: '0.65rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <MicIcon size={16} style={{ color: 'var(--accent-wa)' }} />
                          <span style={{ fontWeight: 700, color: 'var(--accent-wa)' }}>Voice Note Audio & Accurate Transcription</span>
                        </div>
                        {itemDetail.originalNote && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '3px 10px', fontSize: '0.75rem', height: 'auto' }}
                            onClick={() => {
                              navigator.clipboard.writeText(itemDetail.originalNote);
                              showToast('Transcription copied to clipboard!');
                            }}
                          >
                            <CopyIcon size={12} />
                            <span>Copy Text</span>
                          </button>
                        )}
                      </div>

                      <audio controls src={itemDetail.audio} style={{ width: '100%', marginBottom: '0.85rem' }} />

                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                        Spoken Transcription:
                      </div>
                      <div className="original-note-quote" style={{
                        fontSize: '1rem',
                        lineHeight: 1.6,
                        fontStyle: 'normal',
                        fontWeight: 500,
                        color: 'var(--text-main)',
                        background: 'var(--bg-card)',
                        borderLeft: '4px solid var(--accent-wa)',
                        borderRadius: '6px',
                        padding: '0.75rem 1rem'
                      }}>
                        <FormattedText text={itemDetail.originalNote || 'Voice note audio recorded.'} />
                      </div>
                    </div>
                  ) : (
                    <div className="reader-section">
                      <div className="section-label">
                        <MessageSquareIcon size={14} style={{ color: 'var(--accent-wa)' }} />
                        <span>Original WhatsApp Message</span>
                      </div>
                      <div className="original-note-quote">
                        <FormattedText text={itemDetail.originalNote || 'No message body.'} />
                      </div>

                      {/* Attached Images */}
                      {itemDetail.images && itemDetail.images.length > 0 && (
                        <div style={{ marginTop: '0.85rem' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <ImageIcon size={13} />
                            <span>Attached Photo / Media</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
                            {itemDetail.images.map((imgSrc, idx) => (
                              <a key={idx} href={imgSrc} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                                <img
                                  src={imgSrc}
                                  alt={`Attachment ${idx + 1}`}
                                  className="modal-attachment-img"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. Executive Summary */}
                  <div className="reader-section">
                    <div className="section-label">
                      <SparklesIcon size={14} style={{ color: 'var(--accent-purple)' }} />
                      <span>Executive Summary</span>
                    </div>
                    <div style={{ lineHeight: 1.65, color: 'var(--text-main)', fontSize: '0.925rem' }}>
                      <FormattedText text={itemDetail.summary || 'No summary available.'} />
                    </div>
                  </div>

                  {/* 3. GitHub Metadata Box */}
                  {itemDetail.githubDetails && (
                    <div className="reader-section github-details-box">
                      <div className="section-label">
                        <GitHubIcon size={14} />
                        <span>GitHub Repository Information</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                            {itemDetail.githubDetails.repo || itemDetail.title}
                          </div>
                          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.35rem', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                            <span>⭐ {itemDetail.githubDetails.stars || '0'}</span>
                            <span>🍴 {itemDetail.githubDetails.forks || '0'}</span>
                            {itemDetail.githubDetails.language && <span>💻 {itemDetail.githubDetails.language}</span>}
                          </div>
                        </div>
                        {itemDetail.githubDetails.url && (
                          <a
                            href={itemDetail.githubDetails.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                            style={{ fontSize: '0.8rem' }}
                          >
                            <span>Open on GitHub</span>
                            <ExternalLinkIcon size={13} />
                          </a>
                        )}
                      </div>
                      {itemDetail.githubDetails.topics && itemDetail.githubDetails.topics.length > 0 && (
                        <div style={{ marginTop: '0.6rem' }}>
                          {itemDetail.githubDetails.topics.map(t => (
                            <span
                              key={t}
                              className="tag"
                              onClick={() => {
                                setSearch(`#${t.replace(/^#+/, '')}`);
                                setSelectedSlug(null);
                              }}
                              style={{ cursor: 'pointer' }}
                              title={`Filter by #${t.replace(/^#+/, '')}`}
                            >
                              #{t.replace(/^#+/, '')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4. Web Article Metadata */}
                  {itemDetail.articleDetails && itemDetail.articleDetails.url && (
                    <div className="reader-section article-details-box">
                      <div className="section-label">
                        <FileTextIcon size={14} style={{ color: 'var(--accent-cyan)' }} />
                        <span>Web Article Metadata</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                          <a
                            href={itemDetail.articleDetails.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="external-link"
                            style={{ fontSize: '0.95rem', fontWeight: 600 }}
                          >
                            <span>{itemDetail.articleDetails.title || itemDetail.articleDetails.url}</span>
                            <ExternalLinkIcon size={13} />
                          </a>
                          <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            Source: {itemDetail.articleDetails.source || 'Web'} {itemDetail.articleDetails.author ? `• Author: ${itemDetail.articleDetails.author}` : ''}
                          </div>
                        </div>
                        <a
                          href={itemDetail.articleDetails.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary"
                          style={{ fontSize: '0.8rem' }}
                        >
                          <span>Visit Article</span>
                          <ExternalLinkIcon size={13} />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* 5. Key Takeaways */}
                  {itemDetail.keyTakeaways && itemDetail.keyTakeaways.length > 0 && (
                    <div className="reader-section">
                      <div className="section-label">
                        <CheckCircleIcon size={14} style={{ color: 'var(--accent-primary)' }} />
                        <span>Key Takeaways</span>
                      </div>
                      <ul className="takeaways-list">
                        {itemDetail.keyTakeaways.map((t, idx) => (
                          <li key={idx}>
                            <FormattedText text={t} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 6. Actionable Tasks */}
                  {itemDetail.actionableTasks && itemDetail.actionableTasks.length > 0 && (
                    <div className="reader-section">
                      <div className="section-label">
                        <CheckIcon size={14} style={{ color: 'var(--accent-wa)' }} />
                        <span>Actionable Next Steps</span>
                      </div>
                      <div className="tasks-checklist">
                        {itemDetail.actionableTasks.map((task, idx) => (
                          <label key={idx} className="task-item">
                            <input type="checkbox" className="task-checkbox" />
                            <span><FormattedText text={task} /></span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 7. AI Agent Prompt Starter */}
                  {itemDetail.aiPromptStarter && (
                    <div className="reader-section ai-prompt-box">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div className="section-label" style={{ margin: 0 }}>
                          <SparklesIcon size={14} style={{ color: '#818cf8' }} />
                          <span>AI Agent Prompt Starter</span>
                        </div>
                        <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem' }} onClick={copyAiPrompt}>
                          <CopyIcon size={13} />
                          <span>{copiedPrompt ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <pre className="prompt-pre">{itemDetail.aiPromptStarter}</pre>
                    </div>
                  )}

                  {/* 8. Bottom Tags (clickable for search) */}
                  {itemDetail.tags && itemDetail.tags.length > 0 && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginRight: '0.25rem' }}>Tags:</span>
                      {itemDetail.tags.map(t => (
                        <span
                          key={t}
                          className="tag"
                          onClick={() => {
                            setSearch(`#${t.replace(/^#+/, '')}`);
                            setSelectedSlug(null);
                          }}
                          style={{ cursor: 'pointer' }}
                          title={`Filter by #${t.replace(/^#+/, '')}`}
                        >
                          #{t.replace(/^#+/, '')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deletingSlug && createPortal(
        <div className="modal-overlay" onClick={() => setDeletingSlug(null)}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-rose)', marginBottom: '0.5rem' }}>
              <AlertTriangleIcon size={20} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Delete Item</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Are you sure you want to permanently delete this item from your {inboxTitle}?
            </p>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem', cursor: 'pointer', padding: '0.5rem 0.75rem', background: 'var(--bg-input)', borderRadius: '8px' }}>
              <input
                type="checkbox"
                className="task-checkbox"
                checked={deleteFromWaOnDelete}
                onChange={e => setDeleteFromWaOnDelete(e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
                Delete message from WhatsApp too
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setDeletingSlug(null)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDeleteItem(deletingSlug, deleteFromWaOnDelete)}
              >
                <TrashIcon size={14} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Complete Confirmation Modal */}
      {completingSlug && createPortal(
        <div className="modal-overlay" onClick={() => setCompletingSlug(null)}>
          <div className="modal-content" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-wa)', marginBottom: '0.5rem' }}>
              <CheckCircleIcon size={20} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Complete Task</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1.25rem' }}>
              Mark this item as completed in {inboxTitle}.
            </p>

            {/* Task Rating Selector */}
            <div style={{
              marginBottom: '1.15rem',
              padding: '0.85rem 1rem',
              background: 'var(--bg-input)',
              borderRadius: '10px',
              border: '1px solid var(--bg-card-border)'
            }}>
              <div style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}>
                <StarIcon size={14} filled={true} style={{ color: 'var(--accent-amber)' }} />
                <span>Rate this completed task (1 to 5 stars):</span>
              </div>
              <StarRating
                value={completingRating}
                onChange={r => setCompletingRating(r)}
                size={22}
                showLabel={true}
                allowClear={false}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem', cursor: 'pointer', padding: '0.5rem 0.75rem', background: 'var(--bg-input)', borderRadius: '8px' }}>
              <input
                type="checkbox"
                className="task-checkbox"
                checked={deleteFromWaOnComplete}
                onChange={e => setDeleteFromWaOnComplete(e.target.checked)}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>
                Delete message from WhatsApp too
              </span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button className="btn btn-secondary" onClick={() => setCompletingSlug(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => executeToggleStatus(completingSlug, 'done', deleteFromWaOnComplete, completingRating)}
              >
                <CheckIcon size={14} />
                <span>Complete Task</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
