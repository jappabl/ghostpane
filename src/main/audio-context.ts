export function buildAudioPrompt(
  typedPrompt: string,
  microphoneTranscript: string,
  systemTranscript: string
): string {
  const prompt = typedPrompt.trim() || 'Use the screenshot and audio context to answer concisely.'
  const microphone = microphoneTranscript.trim() || 'No speech detected'
  const system = systemTranscript.trim() || 'No speech detected'
  return `${prompt}\n\nMicrophone transcript:\n${microphone}\n\nSystem audio transcript:\n${system}`
}
