/**
 * Meta WhatsApp "Embedded Signup" (Tech Provider flow), browser side.
 *
 * The customer clicks one button, a Meta popup walks them through logging in,
 * choosing/creating their WhatsApp Business Account and verifying a phone
 * number, and we get back (a) a short-lived `code` from FB.login and (b) the
 * new phone_number_id / waba_id via a postMessage event. Both are sent to the
 * server (/api/whatsapp/embedded-signup/complete), which exchanges the code
 * for a business token and finishes onboarding. The app secret never touches
 * the browser.
 */

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

export interface EmbeddedSignupResult {
  code: string;
  phoneNumberId: string;
  wabaId: string;
  businessId: string;
}

let sdkPromise: Promise<void> | null = null;

export function loadFacebookSdk(appId: string, version: string): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const init = () => {
      try {
        window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
        resolve();
      } catch (e) {
        sdkPromise = null;
        reject(e);
      }
    };
    if (window.FB) return init();
    window.fbAsyncInit = init;
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => {
      sdkPromise = null;
      reject(new Error("Couldn't load Facebook's sign-in. Check your connection or ad-blocker and try again."));
    };
    document.body.appendChild(s);
  });
  return sdkPromise;
}

function isFacebookOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

/** Opens the Meta popup. Must be called from a click handler (popup blockers). */
export async function launchWhatsAppEmbeddedSignup(opts: {
  appId: string;
  configId: string;
  sdkVersion?: string;
}): Promise<EmbeddedSignupResult> {
  await loadFacebookSdk(opts.appId, opts.sdkVersion || "v25.0");

  return new Promise<EmbeddedSignupResult>((resolve, reject) => {
    let code = "";
    let ids: { phoneNumberId: string; wabaId: string; businessId: string } | null = null;
    let done = false;

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      fn();
    };
    const maybeResolve = () => {
      if (code && ids) finish(() => resolve({ code, ...ids! }));
    };

    const onMessage = (event: MessageEvent) => {
      if (!isFacebookOrigin(event.origin)) return;
      let data: any;
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
        const d = data.data || {};
        if (!d.phone_number_id || !d.waba_id) {
          return finish(() => reject(new Error("Meta finished but didn't return a phone number. Please try again and complete every step.")));
        }
        ids = {
          phoneNumberId: String(d.phone_number_id),
          wabaId: String(d.waba_id),
          businessId: String(d.business_id || ""),
        };
        maybeResolve();
      } else if (data.event === "CANCEL") {
        const step = data.data?.current_step ? ` (stopped at: ${data.data.current_step})` : "";
        const msg = data.data?.error_message ? `Meta reported: ${data.data.error_message}` : `Sign-up was cancelled${step}.`;
        finish(() => reject(new Error(msg)));
      }
    };
    window.addEventListener("message", onMessage);
    const timer = setTimeout(() => finish(() => reject(new Error("Sign-up timed out. Please try again."))), 15 * 60 * 1000);

    window.FB.login(
      (response: any) => {
        const c = response?.authResponse?.code;
        if (c) {
          code = String(c);
          maybeResolve();
        } else {
          finish(() => reject(new Error("Facebook sign-in was cancelled or didn't complete.")));
        }
      },
      {
        config_id: opts.configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {} },
      }
    );
  });
}
