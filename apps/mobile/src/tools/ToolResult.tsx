import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton, Surface } from '@/src/components/UI';
import { colors, spacing } from '@/src/theme/tokens';
import { ownedAssetUrl, sharePrivateFile } from './privateFiles';
import { authenticatedRequest, type NativeToolResult } from './sessionApi';

export function ToolResult({ result, token }: { result: NativeToolResult; token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const source = useMemo(() => ({ uri: ownedAssetUrl(result.assetId), headers: { Authorization: `Bearer ${token}` } }), [result.assetId, token]);
  return <Surface style={styles.card}>
    <Text style={styles.title}>{result.filename}</Text>
    {result.kind === 'image' ? <Image accessibilityLabel={result.filename} onError={() => setError('SAVI could not load this private image.')} resizeMode="contain" source={source} style={styles.image} /> : null}
    {result.kind === 'video' ? <VideoResult source={source} /> : null}
    {result.kind === 'audio' ? <AudioResult source={source} /> : null}
    {result.kind === 'text' ? <TextResult assetId={result.assetId} token={token} /> : null}
    {result.kind === 'document' || result.kind === 'archive' ? <Text style={styles.detail}>{result.kind === 'document' ? 'Your PDF is ready.' : 'Your ZIP file is ready.'}</Text> : null}
    <Text style={styles.detail}>Private to your SAVI account</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <PrimaryButton disabled={sharing} icon="share-outline" label={sharing ? 'Preparing file...' : 'Open or save a copy'} onPress={() => {
      setSharing(true); setError(null);
      void sharePrivateFile(token, result.assetId, result.filename, result.mimeType).catch(cause => setError(cause instanceof Error ? cause.message : 'File sharing failed.')).finally(() => setSharing(false));
    }} />
  </Surface>;
}

function VideoResult({ source }: { source: { uri: string; headers: { Authorization: string } } }) {
  const player = useVideoPlayer({ ...source, useCaching: false });
  return <VideoView accessibilityLabel="Generated video" player={player} nativeControls style={styles.video} />;
}

function AudioResult({ source }: { source: { uri: string; headers: { Authorization: string } } }) {
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  return <View style={styles.audio}>{status.error ? <Text accessibilityRole="alert" style={styles.error}>This private audio could not be loaded.</Text> : null}<Text style={styles.detail}>{Math.floor(status.currentTime || 0)} / {Math.floor(status.duration || 0)} seconds</Text><PrimaryButton disabled={!status.isLoaded} icon={status.playing ? 'pause' : 'play'} label={!status.isLoaded ? 'Loading audio...' : status.playing ? 'Pause audio' : 'Play audio'} onPress={() => { if (status.playing) player.pause(); else { if (status.didJustFinish) void player.seekTo(0); player.play(); } }} /></View>;
}

function TextResult({ assetId, token }: { assetId: string; token: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void authenticatedRequest(token, `/api/assets/${assetId}`, { signal: controller.signal }).then(response => response.text()).then(value => { if (!controller.signal.aborted) setText(value); }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [assetId, token]);
  return error ? <Text style={styles.error}>Text could not be loaded.</Text> : text === null ? <ActivityIndicator color={colors.violet} /> : <Text selectable style={styles.text}>{text}</Text>;
}

const styles = StyleSheet.create({ card: { gap: spacing.md, padding: spacing.md }, title: { color: colors.text, fontSize: 16, fontWeight: '700' }, detail: { color: colors.textMuted, fontSize: 13 }, image: { aspectRatio: 1, width: '100%', backgroundColor: colors.canvasRaised }, video: { aspectRatio: 16 / 9, width: '100%' }, audio: { gap: spacing.sm }, text: { color: colors.text, fontSize: 15, lineHeight: 23 }, error: { color: colors.danger, fontSize: 13 } });
