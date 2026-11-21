// Vietnamese SpeechSynthesis helper for "Nghe đọc" accessibility button.

export function speakVietnamese(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }
  try {
    const clean = text
      .replace(/\$[^$]*\$/g, (m) =>
        m
          .replace(/\$/g, '')
          .replace(/\\widehat\{([^}]+)\}/g, 'góc $1')
          .replace(/\\sin/g, 'sin ')
          .replace(/\\cos/g, 'côsin ')
          .replace(/\\tan/g, 'tan ')
          .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 chia $2')
          .replace(/\\sqrt\{([^}]+)\}/g, 'căn bậc hai của $1')
          .replace(/\^\\circ/g, ' độ')
          .replace(/\\text\{([^}]+)\}/g, '$1')
          .replace(/\\cdot/g, ' nhân ')
          .replace(/\\times/g, ' nhân ')
          .replace(/[{}]/g, ''),
      )
      .trim();
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'vi-VN';
    utter.rate = 0.96;
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find((v) => v.lang.toLowerCase().startsWith('vi'));
    if (viVoice) utter.voice = viVoice;
    window.speechSynthesis.speak(utter);
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
