import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, type QueryDocumentSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '@/firebase/config';
import { asText, toDateSafe, type TimestampLike } from '@/types/firestore';
import { 
  Video, 
  RefreshCw, 
  Filter, 
  Search, 
  Clock, 
  CheckCircle2, 
  XCircle,
  AlertCircle, 
  Play,
  Youtube,
  Facebook,
  Send,
  RotateCcw,
  Eye,
  Activity
} from 'lucide-react';

type VideoStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'upload_failed';
type ContentType = 'JOB' | 'FAST_TRACK' | 'MOCK_TEST';
type PlatformStatus = 'completed' | 'failed' | 'skipped' | 'pending' | '-';

interface VideoRecord {
  id: string;
  type: ContentType;
  title: string;
  category: string;
  status: VideoStatus;
  publishedAt: TimestampLike;
  videoTriggeredAt: TimestampLike;
  videoStartedAt: TimestampLike;
  videoCompletedAt: TimestampLike;
  videoAttempts: number;
  videoError: string;
  platformStatuses: {
    youtube?: PlatformStatus;
    facebook?: PlatformStatus;
    telegram?: PlatformStatus;
  };
  videoYouTubeUrl: string;
  contentScore: number;
  hook: string;
  duration: number;
  presenter: string;
  layout: string;
  motion: string;
  cta: string;
  deadlineState: string;
  aiVisualUsed: boolean;
  collection: string;
}

const VIDEO_STATUSES: readonly VideoStatus[] = ['queued', 'processing', 'completed', 'failed', 'upload_failed'];
const PLATFORM_STATUSES: readonly PlatformStatus[] = ['completed', 'failed', 'skipped', 'pending', '-'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fieldsFromDoc(docSnap: QueryDocumentSnapshot<DocumentData>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(docSnap.data())) {
    out[key] = value;
  }
  return out;
}

function isVideoStatus(value: unknown): value is VideoStatus {
  return typeof value === 'string' && (VIDEO_STATUSES as readonly string[]).includes(value);
}

function asVideoStatus(value: unknown, fallback: VideoStatus): VideoStatus {
  return isVideoStatus(value) ? value : fallback;
}

function isPlatformStatus(value: unknown): value is PlatformStatus {
  return typeof value === 'string' && (PLATFORM_STATUSES as readonly string[]).includes(value);
}

function asPlatformStatus(value: unknown): PlatformStatus | undefined {
  return isPlatformStatus(value) ? value : undefined;
}

function asPlatformStatuses(value: unknown): VideoRecord['platformStatuses'] {
  if (!isPlainObject(value)) return {};
  return {
    youtube: asPlatformStatus(value.youtube),
    facebook: asPlatformStatus(value.facebook),
    telegram: asPlatformStatus(value.telegram),
  };
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asTimestamp(value: unknown): TimestampLike {
  if (value == null || typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
    return value;
  }
  if (!isPlainObject(value)) return undefined;
  const seconds = typeof value.seconds === 'number' ? value.seconds : undefined;
  const nanoseconds = typeof value.nanoseconds === 'number' ? value.nanoseconds : undefined;
  const maybeToDate = value.toDate;
  if (typeof maybeToDate === 'function') {
    return {
      seconds,
      nanoseconds,
      toDate: () => {
        const result: unknown = maybeToDate.call(value);
        return result instanceof Date ? result : new Date(NaN);
      },
    };
  }
  if (seconds !== undefined) return { seconds, nanoseconds };
  return undefined;
}

function timestampMillis(value: TimestampLike): number {
  return toDateSafe(value)?.getTime() ?? 0;
}

function toVideoRecord(
  id: string,
  data: Record<string, unknown>,
  type: ContentType,
  collectionName: string,
): VideoRecord {
  const fallbackStatus: VideoStatus =
    type === 'MOCK_TEST' && Boolean(data.mockVideoMade) ? 'completed' : 'queued';
  const title = asText(data.title) || (type === 'MOCK_TEST' ? asText(data.subject) : '') || 'Untitled';
  return {
    id,
    type,
    title,
    category: asText(data.category, 'Unknown'),
    status: asVideoStatus(data.videoStatus, fallbackStatus),
    publishedAt: asTimestamp(data.publishedAt),
    videoTriggeredAt: asTimestamp(data.videoTriggeredAt),
    videoStartedAt: asTimestamp(data.videoStartedAt),
    videoCompletedAt: asTimestamp(data.videoCompletedAt),
    videoAttempts: asFiniteNumber(data.videoAttempts),
    videoError: asText(data.videoError),
    platformStatuses: asPlatformStatuses(data.platformStatuses),
    videoYouTubeUrl: asText(data.videoYouTubeUrl),
    contentScore: asFiniteNumber(data.contentScore),
    hook: asText(data.hook),
    duration: asFiniteNumber(data.duration),
    presenter: asText(data.presenter),
    layout: asText(data.layout),
    motion: asText(data.motion),
    cta: asText(data.cta),
    deadlineState: asText(data.deadlineState),
    aiVisualUsed: data.aiVisualUsed === true,
    collection: collectionName,
  };
}

async function loadVideoRecords(): Promise<VideoRecord[]> {
  const allVideos: VideoRecord[] = [];

  const jobsQuery = query(
    collection(db, 'jobs'),
    orderBy('videoTriggeredAt', 'desc'),
    limit(100)
  );
  const jobsSnap = await getDocs(jobsQuery);
  jobsSnap.forEach(docSnap => {
    const data = fieldsFromDoc(docSnap);
    if (data.videoTriggeredAt || data.videoStatus) {
      allVideos.push(toVideoRecord(docSnap.id, data, 'JOB', 'jobs'));
    }
  });

  const fastTrackQuery = query(
    collection(db, 'fast_track'),
    orderBy('videoTriggeredAt', 'desc'),
    limit(100)
  );
  const fastTrackSnap = await getDocs(fastTrackQuery);
  fastTrackSnap.forEach(docSnap => {
    const data = fieldsFromDoc(docSnap);
    if (data.videoTriggeredAt || data.videoStatus) {
      allVideos.push(toVideoRecord(docSnap.id, data, 'FAST_TRACK', 'fast_track'));
    }
  });

  const mockTestQuery = query(
    collection(db, 'mock_tests'),
    orderBy('videoTriggeredAt', 'desc'),
    limit(100)
  );
  const mockTestSnap = await getDocs(mockTestQuery);
  mockTestSnap.forEach(docSnap => {
    const data = fieldsFromDoc(docSnap);
    if (data.videoTriggeredAt || data.videoStatus || data.mockVideoMade) {
      allVideos.push(toVideoRecord(docSnap.id, data, 'MOCK_TEST', 'mock_tests'));
    }
  });

  allVideos.sort((a, b) => timestampMillis(b.videoTriggeredAt) - timestampMillis(a.videoTriggeredAt));
  return allVideos;
}

const VideoControlCenter = () => {
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<VideoStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<ContentType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<VideoRecord | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchVideos = async () => {
    setLoading(true);
    try {
      setVideos(await loadVideoRecords());
    } catch (error) {
      console.error('Error fetching videos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void loadVideoRecords()
      .then((records) => {
        if (!cancelled) setVideos(records);
      })
      .catch((error: unknown) => {
        console.error('Error fetching videos:', error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter and search
  const filteredVideos = videos.filter(video => {
    if (filterStatus !== 'all' && video.status !== filterStatus) return false;
    if (filterType !== 'all' && video.type !== filterType) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        video.title.toLowerCase().includes(query) ||
        video.id.toLowerCase().includes(query) ||
        video.category.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Summary counts
  const summary = {
    queued: videos.filter(v => v.status === 'queued').length,
    processing: videos.filter(v => v.status === 'processing').length,
    completed: videos.filter(v => v.status === 'completed').length,
    failed: videos.filter(v => v.status === 'failed' || v.status === 'upload_failed').length,
    total: videos.length
  };

  // Type breakdown
  const typeBreakdown = {
    JOB: {
      queued: videos.filter(v => v.type === 'JOB' && v.status === 'queued').length,
      processing: videos.filter(v => v.type === 'JOB' && v.status === 'processing').length,
      completed: videos.filter(v => v.type === 'JOB' && v.status === 'completed').length,
      failed: videos.filter(v => v.type === 'JOB' && (v.status === 'failed' || v.status === 'upload_failed')).length
    },
    FAST_TRACK: {
      queued: videos.filter(v => v.type === 'FAST_TRACK' && v.status === 'queued').length,
      processing: videos.filter(v => v.type === 'FAST_TRACK' && v.status === 'processing').length,
      completed: videos.filter(v => v.type === 'FAST_TRACK' && v.status === 'completed').length,
      failed: videos.filter(v => v.type === 'FAST_TRACK' && (v.status === 'failed' || v.status === 'upload_failed')).length
    },
    MOCK_TEST: {
      queued: videos.filter(v => v.type === 'MOCK_TEST' && v.status === 'queued').length,
      processing: videos.filter(v => v.type === 'MOCK_TEST' && v.status === 'processing').length,
      completed: videos.filter(v => v.type === 'MOCK_TEST' && v.status === 'completed').length,
      failed: videos.filter(v => v.type === 'MOCK_TEST' && (v.status === 'failed' || v.status === 'upload_failed')).length
    }
  };

  // Status helpers
  const getStatusIcon = (status: VideoStatus) => {
    switch (status) {
      case 'queued': return <Clock className="text-yellow-500" size={20} />;
      case 'processing': return <Play className="text-blue-500 animate-pulse" size={20} />;
      case 'completed': return <CheckCircle2 className="text-green-500" size={20} />;
      case 'failed':
      case 'upload_failed': return <XCircle className="text-red-500" size={20} />;
      default: return <AlertCircle className="text-gray-500" size={20} />;
    }
  };

  const getStatusColor = (status: VideoStatus) => {
    switch (status) {
      case 'queued': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
      case 'upload_failed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (timestamp: TimestampLike) => {
    const date = toDateSafe(timestamp);
    if (!date) return '—';
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isStatusFilter = (value: string): value is VideoStatus | 'all' =>
    value === 'all' || isVideoStatus(value);
  const isTypeFilter = (value: string): value is ContentType | 'all' =>
    value === 'all' || value === 'JOB' || value === 'FAST_TRACK' || value === 'MOCK_TEST';

  // Retry handler
  const handleRetry = async (video: VideoRecord) => {
    if (!confirm(`Retry this video?\nAttempt ${video.videoAttempts + 1} of 3 will be used.`)) {
      return;
    }

    setRetryingId(video.id);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const videoRef = doc(db, video.collection, video.id);
      await updateDoc(videoRef, {
        videoStatus: 'queued',
        videoError: '',
        videoLockId: null,
        updatedAt: new Date()
      });
      alert('Video added back to queue.');
      await fetchVideos();
    } catch (error) {
      console.error('Retry error:', error);
      alert('Retry failed. Please try again.');
    } finally {
      setRetryingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-xl border shadow-lg">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="animate-spin text-blue-500" size={32} />
          <span className="ml-3 text-gray-600">Loading video queue...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Video className="text-purple-600" size={28} />
              Video Control Center
            </h2>
            <p className="text-gray-600 mt-1">Monitor and manage your video generation queue</p>
          </div>
          <button
            onClick={() => { void fetchVideos(); }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="text-yellow-600" size={20} />
              <span className="text-sm font-medium text-yellow-800">QUEUED</span>
            </div>
            <div className="text-2xl font-bold text-yellow-900">{summary.queued}</div>
            <div className="text-xs text-yellow-700">Waiting</div>
          </div>

          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Play className="text-blue-600" size={20} />
              <span className="text-sm font-medium text-blue-800">PROCESSING</span>
            </div>
            <div className="text-2xl font-bold text-blue-900">{summary.processing}</div>
            <div className="text-xs text-blue-700">Generating</div>
          </div>

          <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="text-green-600" size={20} />
              <span className="text-sm font-medium text-green-800">COMPLETED TODAY</span>
            </div>
            <div className="text-2xl font-bold text-green-900">{summary.completed}</div>
            <div className="text-xs text-green-700">Published</div>
          </div>

          <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="text-red-600" size={20} />
              <span className="text-sm font-medium text-red-800">FAILED</span>
            </div>
            <div className="text-2xl font-bold text-red-900">{summary.failed}</div>
            <div className="text-xs text-red-700">Needs attention</div>
          </div>

          <div className="bg-purple-50 border border-purple-200 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="text-purple-600" size={20} />
              <span className="text-sm font-medium text-purple-800">TOTAL</span>
            </div>
            <div className="text-2xl font-bold text-purple-900">{summary.total}</div>
            <div className="text-xs text-purple-700">All videos</div>
          </div>
        </div>

        {/* Type Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {(['JOB', 'FAST_TRACK', 'MOCK_TEST'] as ContentType[]).map(type => {
            const breakdown = typeBreakdown[type];
            return (
              <div key={type} className="border rounded-lg p-4">
                <h3 className="font-bold text-gray-900 mb-3">{type.replace('_', ' ')}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-yellow-700">Queued:</span>
                    <span className="font-bold">{breakdown.queued}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700">Processing:</span>
                    <span className="font-bold">{breakdown.processing}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700">Completed:</span>
                    <span className="font-bold">{breakdown.completed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-700">Failed:</span>
                    <span className="font-bold">{breakdown.failed}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={18} />
            <span className="font-semibold">Filters</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select
              value={filterStatus}
              onChange={e => {
                if (isStatusFilter(e.target.value)) setFilterStatus(e.target.value);
              }}
              className="border rounded-lg px-3 py-2 bg-white"
            >
              <option value="all">All Status</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="upload_failed">Upload Failed</option>
            </select>

            <select
              value={filterType}
              onChange={e => {
                if (isTypeFilter(e.target.value)) setFilterType(e.target.value);
              }}
              className="border rounded-lg px-3 py-2 bg-white"
            >
              <option value="all">All Types</option>
              <option value="JOB">JOB</option>
              <option value="FAST_TRACK">FAST_TRACK</option>
              <option value="MOCK_TEST">MOCK_TEST</option>
            </select>

            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search title, ID, or category..."
                className="w-full border rounded-lg pl-10 pr-3 py-2 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Video Queue Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left p-3 font-semibold">Status</th>
                <th className="text-left p-3 font-semibold">Type</th>
                <th className="text-left p-3 font-semibold">Title</th>
                <th className="text-left p-3 font-semibold">Category</th>
                <th className="text-left p-3 font-semibold">Published</th>
                <th className="text-left p-3 font-semibold">Attempts</th>
                <th className="text-left p-3 font-semibold">YouTube</th>
                <th className="text-left p-3 font-semibold">Facebook</th>
                <th className="text-left p-3 font-semibold">Telegram</th>
                <th className="text-left p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVideos.map(video => (
                <tr key={video.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(video.status)}
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(video.status)}`}>
                        {video.status.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">
                      {video.type}
                    </span>
                  </td>
                  <td className="p-3 font-medium text-gray-900 max-w-xs truncate">
                    {video.title}
                  </td>
                  <td className="p-3 text-gray-600">{video.category}</td>
                  <td className="p-3 text-gray-600">{formatDate(video.publishedAt)}</td>
                  <td className="p-3">
                    <span className={`font-mono ${video.videoAttempts >= 2 ? 'text-red-600 font-bold' : 'text-gray-700'}`}>
                      {video.videoAttempts}/3
                    </span>
                  </td>
                  <td className="p-3">
                    {video.platformStatuses.youtube === 'completed' ? (
                      <a href={video.videoYouTubeUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline">
                        <Youtube size={18} />
                      </a>
                    ) : video.platformStatuses.youtube === 'failed' ? (
                      <XCircle className="text-red-500" size={18} />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {video.platformStatuses.facebook === 'completed' ? (
                      <CheckCircle2 className="text-green-500" size={18} />
                    ) : video.platformStatuses.facebook === 'failed' ? (
                      <XCircle className="text-red-500" size={18} />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {video.platformStatuses.telegram === 'completed' ? (
                      <CheckCircle2 className="text-green-500" size={18} />
                    ) : video.platformStatuses.telegram === 'failed' ? (
                      <XCircle className="text-red-500" size={18} />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedVideo(video)}
                        className="p-1 hover:bg-gray-200 rounded"
                        title="View details"
                      >
                        <Eye size={16} />
                      </button>
                      {(video.status === 'failed' || video.status === 'upload_failed') && video.videoAttempts < 3 && (
                        <button
                          onClick={() => { void handleRetry(video); }}
                          disabled={retryingId === video.id}
                          className="p-1 hover:bg-blue-100 rounded text-blue-600 disabled:opacity-50"
                          title="Retry"
                        >
                          <RotateCcw size={16} className={retryingId === video.id ? 'animate-spin' : ''} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredVideos.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-500">
                    {videos.length === 0 ? (
                      <div>
                        <Video className="mx-auto mb-2 text-gray-400" size={32} />
                        <p className="font-medium">No videos in queue</p>
                        <p className="text-sm">Publish a JOB or FAST_TRACK to start video generation</p>
                      </div>
                    ) : (
                      <p>No videos match your filters</p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Video Detail Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Video Details</h3>
                <button
                  onClick={() => setSelectedVideo(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle size={24} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700">Title</label>
                  <p className="text-gray-900">{selectedVideo.title}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Type</label>
                    <p className="text-gray-900">{selectedVideo.type}</p>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-gray-700">Category</label>
                    <p className="text-gray-900">{selectedVideo.category}</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Timeline</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Published:</span>
                      <span className="text-gray-900">{formatDate(selectedVideo.publishedAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Triggered:</span>
                      <span className="text-gray-900">{formatDate(selectedVideo.videoTriggeredAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Started:</span>
                      <span className="text-gray-900">{formatDate(selectedVideo.videoStartedAt)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Completed:</span>
                      <span className="text-gray-900">{formatDate(selectedVideo.videoCompletedAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Status</h4>
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(selectedVideo.status)}
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(selectedVideo.status)}`}>
                      {selectedVideo.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">Attempts: {selectedVideo.videoAttempts}/3</p>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Growth Engine</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-600">Content Score:</span> <span className="font-medium">{selectedVideo.contentScore}</span></div>
                    <div><span className="text-gray-600">Duration:</span> <span className="font-medium">{selectedVideo.duration}s</span></div>
                    <div><span className="text-gray-600">Hook:</span> <span className="font-medium">{selectedVideo.hook || '—'}</span></div>
                    <div><span className="text-gray-600">Presenter:</span> <span className="font-medium">{selectedVideo.presenter || '—'}</span></div>
                    <div><span className="text-gray-600">Layout:</span> <span className="font-medium">{selectedVideo.layout || '—'}</span></div>
                    <div><span className="text-gray-600">Motion:</span> <span className="font-medium">{selectedVideo.motion || '—'}</span></div>
                    <div><span className="text-gray-600">Deadline:</span> <span className="font-medium">{selectedVideo.deadlineState || '—'}</span></div>
                    <div><span className="text-gray-600">AI Visual:</span> <span className="font-medium">{selectedVideo.aiVisualUsed ? '✓' : '—'}</span></div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Platform Status</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Youtube size={18} />
                        YouTube
                      </span>
                      <span className={`px-2 py-1 rounded text-xs ${selectedVideo.platformStatuses.youtube === 'completed' ? 'bg-green-100 text-green-800' : selectedVideo.platformStatuses.youtube === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                        {selectedVideo.platformStatuses.youtube || '—'}
                      </span>
                    </div>
                    {selectedVideo.videoYouTubeUrl && (
                      <a href={selectedVideo.videoYouTubeUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                        View on YouTube →
                      </a>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Facebook size={18} />
                        Facebook
                      </span>
                      <span className={`px-2 py-1 rounded text-xs ${selectedVideo.platformStatuses.facebook === 'completed' ? 'bg-green-100 text-green-800' : selectedVideo.platformStatuses.facebook === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                        {selectedVideo.platformStatuses.facebook || '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Send size={18} />
                        Telegram
                      </span>
                      <span className={`px-2 py-1 rounded text-xs ${selectedVideo.platformStatuses.telegram === 'completed' ? 'bg-green-100 text-green-800' : selectedVideo.platformStatuses.telegram === 'failed' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                        {selectedVideo.platformStatuses.telegram || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedVideo.videoError && (
                  <div className="border-t pt-4">
                    <h4 className="font-semibold text-red-900 mb-2">Error</h4>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 font-mono">
                      {selectedVideo.videoError}
                    </div>
                  </div>
                )}

                <div className="border-t pt-4 flex gap-2">
                  <button
                    onClick={() => setSelectedVideo(null)}
                    className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
                  >
                    Close
                  </button>
                  {(selectedVideo.status === 'failed' || selectedVideo.status === 'upload_failed') && selectedVideo.videoAttempts < 3 && (
                    <button
                      onClick={() => {
                        void handleRetry(selectedVideo);
                        setSelectedVideo(null);
                      }}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                    >
                      <RotateCcw size={16} />
                      Retry Video
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoControlCenter;
