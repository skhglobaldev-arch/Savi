export type SaviRadioFormat = 'solo' | 'news' | 'podcast' | 'story';
export type SaviRadioLength = 'short' | 'standard' | 'long';

/**
 * Radio Talk is a deterministic script formatter. Keeping it local means the
 * customer is charged only for the one TTS request that creates their audio.
 */
export function createSaviRadioScript(topic: string, format: SaviRadioFormat, length: SaviRadioLength) {
  const cleanTopic = topic.trim() || 'how AI can help people turn messy ideas into useful outputs';
  const isPersian = /[\u0600-\u06FF]/.test(cleanTopic);

  if (isPersian) {
    const intro =
      format === 'news'
        ? 'سلام. این بخش خبری SAVI است؛ یک روایت روشن، کوتاه و کاربردی از موضوع امروز.'
        : format === 'podcast'
          ? 'به SAVI Radio خوش آمدید. امروز قرار است یک ایده خام را آرام، قابل فهم و قابل اجرا باز کنیم.'
          : format === 'story'
            ? 'امشب در SAVI Radio از یک ایده ساده شروع می کنیم و آن را به یک مسیر عملی تبدیل می کنیم.'
            : 'به SAVI Radio خوش آمدید. من میزبان شما هستم و این یک بخش کوتاه و کاربردی درباره ایده امروز است.';

    const middle =
      length === 'long'
        ? '\n\nدر ادامه اگر بخواهیم این موضوع را برای یک برنامه بلندتر باز کنیم، باید چند مثال واقعی، یک گفت وگوی کوتاه فرضی، و در پایان سه قدم اجرایی مشخص اضافه کنیم؛ قدم اول شناخت مسئله، قدم دوم ساخت خروجی اولیه، و قدم سوم آماده کردن آن برای ارائه یا فروش.'
        : length === 'standard'
          ? '\n\nبرای اینکه این ایده فقط در حد حرف نماند، بهتر است یک نمونه کوچک از خروجی بسازیم، آن را با یک نفر واقعی تست کنیم، و بعد بر اساس بازخورد، نسخه بعدی را دقیق تر کنیم.'
          : '';

    const close =
      format === 'news'
        ? 'این بود خلاصه امروز از SAVI؛ کوتاه، شفاف و آماده برای اقدام بعدی.'
        : 'این بود SAVI Radio؛ ایده را بردارید، شکلش بدهید و آن را به یک خروجی قابل استفاده تبدیل کنید.';

    return `${intro}

موضوع امروز این است: ${cleanTopic}

نکته اصلی اینجاست: ارزش یک ایده فقط در خود ایده نیست؛ ارزش واقعی وقتی ساخته می شود که آن ایده به یک خروجی مشخص تبدیل شود. یعنی کاربر بداند چه چیزی مهم است، چه چیزی اضافه است، و قدم بعدی دقیقاً چیست.

اگر این موضوع را به یک محصول قابل فروش تبدیل کنیم، باید اول مسئله را ساده تعریف کنیم، بعد یک نتیجه قابل لمس بسازیم، و در نهایت تجربه کاربر را آن قدر راحت کنیم که بدون سردرگمی به خروجی برسد.

از نگاه SAVI، ابزار خوب نباید شلوغ و گیج کننده باشد. باید آرام، سریع و قابل کنترل باشد؛ طوری که کاربر حس کند همه چیز دم دست اوست و هر دستور مستقیم به یک نتیجه قابل استفاده می رسد.${middle}

${close}`;
  }

  const intro =
    format === 'news'
      ? 'Good evening. This is SAVI News Brief, bringing you a clear look at today\'s topic.'
      : format === 'podcast'
        ? 'Welcome back to SAVI Radio. Settle in, because today we are turning a rough idea into a useful conversation.'
        : format === 'story'
          ? 'Tonight on SAVI Radio, we open with a small idea that becomes a practical system.'
          : 'Welcome back to SAVI Radio. I am your host, and this is your focused AI-powered segment.';

  const close =
    format === 'news'
      ? 'That is your SAVI brief. Clear facts, useful context, and a practical next step.'
      : 'This was SAVI Radio. Take the idea, shape it, and turn it into something useful.';

  return `${intro}

Today we are talking about: ${cleanTopic}

First, here is the main idea. The value is not only in having information. The value is in turning information into a clear next action. SAVI should help the listener understand what matters, what can be ignored, and what should happen next.

Second, let us make it practical. If this topic was a real project, the best output would include a short summary, a list of decisions, a useful script or plan, and a simple way to export or continue the work.

Third, the human angle matters. Good AI tools should feel calm, fast, and easy. The user should never feel lost inside settings. The tool should guide them, but still leave them in control.

${length === 'long' ? 'For a longer segment, we would add examples, a short interview-style exchange, and a final recap that turns the topic into three action steps.' : ''}

${close}`;
}
