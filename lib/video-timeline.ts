type Segment = { segmentIndex: number; assetId: string; sha256: string; duration: number };
type AudioAssembly = { duration: number; segments: { duration: number; lineIds: string[] }[]; lines: { lineId: string; start: number; end: number; segmentIndex: number; segmentStart: number; segmentEnd: number }[] };
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const near = (a: number, b: number) => Math.abs(a - b) <= 0.000001;

// Planning only: inputs must already have passed media probing; no file is concatenated here.
export function planVideoTimeline(input: { segments: Segment[]; audioAssembly: AudioAssembly }) {
  const audio = input?.audioAssembly, videos = input?.segments;
  if (!audio || !Array.isArray(videos) || !videos.length || videos.length > 4 || !Array.isArray(audio.segments) || videos.length !== audio.segments.length || !Array.isArray(audio.lines) || !audio.lines.length || audio.lines.length > 10 || !finite(audio.duration) || audio.duration <= 0 || audio.duration > 60) throw new Error('Invalid timeline inputs');
  const lines: { lineId: string; start: number; end: number }[] = [];
  const segments: (Segment & { start: number })[] = [];
  const seen = new Set<string>(), assets = new Set<string>();
  let videoOffset = 0, audioOffset = 0, cursor = 0;
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i], source = audio.segments[i];
    if (!video || video.segmentIndex !== i || typeof video.assetId !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(video.assetId) || assets.has(video.assetId) || typeof video.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(video.sha256) || !finite(video.duration) || video.duration <= 0 || video.duration > 20 || !source || !finite(source.duration) || source.duration <= 0 || source.duration > 20 || Math.abs(video.duration - source.duration) > 0.129002 || !Array.isArray(source.lineIds) || !source.lineIds.length) throw new Error('Invalid timeline segment');
    assets.add(video.assetId);
    segments.push({ segmentIndex: i, assetId: video.assetId, sha256: video.sha256, duration: video.duration, start: videoOffset });
    let previousEnd = 0;
    for (const id of source.lineIds) {
      const line = audio.lines[cursor++];
      if (typeof id !== 'string' || !id.trim() || seen.has(id) || !line || line.lineId !== id || line.segmentIndex !== i || !finite(line.segmentStart) || !finite(line.segmentEnd) || !finite(line.start) || !finite(line.end) || line.segmentStart < previousEnd || line.segmentEnd <= line.segmentStart || line.segmentEnd > source.duration || !near(line.start, audioOffset + line.segmentStart) || !near(line.end, audioOffset + line.segmentEnd)) throw new Error('Invalid timeline line');
      const end = Math.min(line.segmentEnd, video.duration);
      if (end <= line.segmentStart || line.segmentEnd - end > 0.129002) throw new Error('Line exceeds video');
      seen.add(id); previousEnd = line.segmentEnd;
      lines.push({ lineId: id, start: videoOffset + line.segmentStart, end: videoOffset + end });
    }
    audioOffset += source.duration; videoOffset += video.duration;
  }
  if (cursor !== audio.lines.length || !near(audioOffset, audio.duration)) throw new Error('Incomplete timeline');
  return { duration: videoOffset, segments, lines };
}
