import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * Manages browser SpeechRecognition lifecycle.
 *
 * Design notes:
 * - The SpeechRecognition instance lives in a useRef (not useState) because it
 *   is an imperative DOM-API object that never needs to trigger a re-render.
 * - onTranscript is stored in a separate ref so callers can pass an inline function
 *   without causing the recognition instance to be recreated on every render.
 */
export function useSpeechRecognition(onTranscript?: (transcript: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  /* Keep the transcript callback ref up-to-date without re-running the setup effect. */
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const speechRecognitionCtor: typeof SpeechRecognition | undefined =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!speechRecognitionCtor) {
      return undefined;
    }

    const recognition = new speechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('');

      onTranscriptRef.current?.(transcript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  /* Abort in-flight recognition and reset the listening flag. */
  const abortListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      setIsListening(false);
    }
  }, []);

  return { isListening, recognitionRef, startListening, stopListening, abortListening };
}
