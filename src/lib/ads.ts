/**
 * Google AdSense configuration, read at BUILD time from environment variables
 * (set them as GitHub repository variables; see README). When the client ID is
 * empty, no ad script, ad slot or placeholder is rendered at all.
 */
export const ADS = {
  /** Publisher ID, e.g. "ca-pub-1234567890123456". */
  client: (process.env.NEXT_PUBLIC_ADSENSE_CLIENT || '').trim(),
  slots: {
    /** Ad unit shown on the start screen. */
    home: (process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME || '').trim(),
    /** Ad unit shown in the right sidebar below the export panel (desktop). */
    sidebar: (process.env.NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR || '').trim(),
  },
};

export const adsEnabled = /^ca-pub-\d{10,20}$/.test(ADS.client);
