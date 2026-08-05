/** Wrapper Web Speech API: bacakan teks (TTS) dan tangkap ucapan sebagai teks (STT). */

export function speak(text: string, lang = 'id-ID') {
  if (!('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

type SpeechRecognitionCtor = new () => SpeechRecognition

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null
}

/** Mulai speech-to-text sekali ucap, resolve dengan transkrip teks. */
export function listenOnce(lang = 'id-ID'): Promise<string> {
  return new Promise((resolve, reject) => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      reject(new Error('Speech recognition tidak didukung browser ini'))
      return
    }

    const recognition = new Ctor()
    recognition.lang = lang
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      resolve(event.results[0][0].transcript)
    }
    recognition.onerror = (event) => {
      reject(new Error(event.error))
    }

    recognition.start()
  })
}
