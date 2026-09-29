import React from 'react';

// Brand marks for every app AXON can connect to.
//
// The monochrome marks below are the official paths from the simple-icons
// project, inlined here so the icons are exact without shipping the whole
// package. Each is tinted the way that brand's own app icon reads on a dark
// tile. Gmail, Slack, Google Drive and Notes are multi-colour by design and
// keep their full palettes.

// ── AI providers ────────────────────────────────────────────────

export const OpenAILogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
    <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.0379-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
  </svg>
);

export const AnthropicLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#D97757" aria-hidden="true">
    <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/>
  </svg>
);

export const GeminiLogo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <path d="M14 28C14 26.0633 13.6267 24.2433 12.88 22.54C12.1567 20.8367 11.165 19.355 9.905 18.095C8.645 16.835 7.16333 15.8433 5.46 15.12C3.75667 14.3733 1.93667 14 0 14C1.93667 14 3.75667 13.6383 5.46 12.915C7.16333 12.1683 8.645 11.165 9.905 9.905C11.165 8.645 12.1567 7.16333 12.88 5.46C13.6267 3.75667 14 1.93667 14 0C14 1.93667 14.3617 3.75667 15.085 5.46C15.8317 7.16333 16.835 8.645 18.095 9.905C19.355 11.165 20.8367 12.1683 22.54 12.915C24.2433 13.6383 26.0633 14 28 14C26.0633 14 24.2433 14.3733 22.54 15.12C20.8367 15.8433 19.355 16.835 18.095 18.095C16.835 19.355 15.8317 20.8367 15.085 22.54C14.3617 24.2433 14 26.0633 14 28Z" fill="url(#geminiGrad)"/>
    <defs>
      <linearGradient id="geminiGrad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#4285F4"/>
        <stop offset="50%" stopColor="#9B72CB"/>
        <stop offset="100%" stopColor="#EA4335"/>
      </linearGradient>
    </defs>
  </svg>
);

export const PerplexityLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
    <path d="M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z"/>
  </svg>
);

export const CursorLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
    <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"/>
  </svg>
);

export const GrokLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
    <path d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"/>
  </svg>
);


// ── Data sources ────────────────────────────────────────────────

export const NotionLogo = ({ size = 24 }) => (
  // Notion's own icon is a white tile with a black glyph, so it keeps the tile.
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <rect width="24" height="24" rx="5" fill="#ffffff"/>
    <g transform="translate(3.1 3.1) scale(0.74)">
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" fill="#000000"/>
    </g>
  </svg>
);

export const GitHubLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
  </svg>
);

export const SlackLogo = ({ size = 24 }) => (
  // Slack's four-colour mark, kept in its own palette.
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A"/>
    <path d="M6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
    <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0"/>
    <path d="M8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
    <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D"/>
    <path d="M17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D"/>
    <path d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E"/>
    <path d="M15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#ECB22E"/>
  </svg>
);

export const GmailLogo = ({ size = 24 }) => (
  // The real Gmail envelope is four-colour — the single red glyph it replaced
  // was not the actual mark.
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#4CAF50" d="M45 16.2l-5 2.75-5 4.75V40h7a3 3 0 0 0 3-3V16.2z"/>
    <path fill="#1E88E5" d="M3 16.2l3.614 1.71L13 23.7V40H6a3 3 0 0 1-3-3V16.2z"/>
    <polygon fill="#E53935" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17"/>
    <path fill="#C62828" d="M3 12.298V16.2l10 7.5V11.2L9.876 8.859A4.298 4.298 0 0 0 7.298 8 4.298 4.298 0 0 0 3 12.298z"/>
    <path fill="#FBC02D" d="M45 12.298V16.2l-10 7.5V11.2l3.124-2.341A4.298 4.298 0 0 1 40.702 8 4.298 4.298 0 0 1 45 12.298z"/>
  </svg>
);

export const LinearLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#5E6AD2" aria-hidden="true">
    <path d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z"/>
  </svg>
);

export const GoogleDriveLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#1E88E5" d="M6.6 40l-4.3-7.4 15.1-26.1 4.3 7.4z"/>
    <path fill="#FBC02D" d="M41.4 40H11.2l4.3-7.4h30.2z"/>
    <path fill="#4CAF50" d="M45.7 32.6H15.5L30.6 6.5h8.6z"/>
    <path fill="#1565C0" d="M6.6 40h30.2l4.6-7.4H11.2z" opacity="0"/>
  </svg>
);

export const ObsidianLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#7C3AED" aria-hidden="true">
    <path d="M19.355 18.538a68.967 68.959 0 0 0 1.858-2.954.81.81 0 0 0-.062-.9c-.516-.685-1.504-2.075-2.042-3.362-.553-1.321-.636-3.375-.64-4.377a1.707 1.707 0 0 0-.358-1.05l-3.198-4.064a3.744 3.744 0 0 1-.076.543c-.106.503-.307 1.004-.536 1.5-.134.29-.29.6-.446.914l-.31.626c-.516 1.068-.997 2.227-1.132 3.59-.124 1.26.046 2.73.815 4.481.128.011.257.025.386.044a6.363 6.363 0 0 1 3.326 1.505c.916.79 1.744 1.922 2.415 3.5zM8.199 22.569c.073.012.146.02.22.02.78.024 2.095.092 3.16.29.87.16 2.593.64 4.01 1.055 1.083.316 2.198-.548 2.355-1.664.114-.814.33-1.735.725-2.58l-.01.005c-.67-1.87-1.522-3.078-2.416-3.849a5.295 5.295 0 0 0-2.778-1.257c-1.54-.216-2.952.19-3.84.45.532 2.218.368 4.829-1.425 7.531zM5.533 9.938c-.023.1-.056.197-.098.29L2.82 16.059a1.602 1.602 0 0 0 .313 1.772l4.116 4.24c2.103-3.101 1.796-6.02.836-8.3-.728-1.73-1.832-3.081-2.55-3.831zM9.32 14.01c.615-.183 1.606-.465 2.745-.534-.683-1.725-.848-3.233-.716-4.577.154-1.552.7-2.847 1.235-3.95.113-.235.223-.454.328-.664.149-.297.288-.577.419-.86.217-.47.379-.885.46-1.27.08-.38.08-.72-.014-1.043-.095-.325-.297-.675-.68-1.06a1.6 1.6 0 0 0-1.475.36l-4.95 4.452a1.602 1.602 0 0 0-.513.952l-.427 2.83c.672.59 2.328 2.316 3.335 4.711.09.21.175.43.253.653z"/>
  </svg>
);

export const AppleNotesLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <rect x="7" y="6" width="34" height="36" rx="5" fill="#FFFFFF"/>
    <path d="M7 11a5 5 0 0 1 5-5h24a5 5 0 0 1 5 5v4H7v-4z" fill="#FFC833"/>
    <g stroke="#D5D5D5" strokeWidth="2.4" strokeLinecap="round">
      <path d="M14 23h20M14 29h20M14 35h13"/>
    </g>
  </svg>
);


// ── AI Provider Config (with logos) ─────────────────────────────

export const AI_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    tagline: 'GPT-4o, o1, DALL·E and all OpenAI models',
    placeholder: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    docsLabel: 'platform.openai.com/api-keys',
    color: '#10a37f',
    bg: 'linear-gradient(135deg, #10a37f, #1a7f64)',
    Logo: OpenAILogo,
    guide: [
      'Go to platform.openai.com/api-keys',
      'Click "Create new secret key"',
      'Copy the key (starts with sk-proj-)',
      'Paste it below and click Test & Connect',
    ],
  },
  {
    id: 'anthropic',
    name: 'Claude',
    tagline: 'Claude 3.5 Sonnet, Haiku and Opus',
    placeholder: 'sk-ant-api03-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    docsLabel: 'console.anthropic.com/settings/keys',
    color: '#d97706',
    bg: 'linear-gradient(135deg, #d97706, #b45309)',
    Logo: AnthropicLogo,
    guide: [
      'Go to console.anthropic.com → Settings → API Keys',
      'Click "Create Key"',
      'Copy the key (starts with sk-ant-)',
      'Paste it below and click Test & Connect',
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    tagline: 'Gemini 1.5 Pro, Flash and Nano',
    placeholder: 'AIzaSy...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    docsLabel: 'aistudio.google.com/app/apikey',
    color: '#4285F4',
    bg: 'linear-gradient(135deg, #4285F4, #1a73e8)',
    Logo: GeminiLogo,
    guide: [
      'Go to Google AI Studio → Get API Key',
      'Select or create a Google Cloud project',
      'Copy the API key (starts with AIzaSy)',
      'Paste it below and click Test & Connect',
    ],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    tagline: 'Sonar models with real-time web search',
    placeholder: 'pplx-...',
    docsUrl: 'https://www.perplexity.ai/settings/api',
    docsLabel: 'perplexity.ai/settings/api',
    color: '#20b2aa',
    bg: 'linear-gradient(135deg, #20b2aa, #0e9490)',
    Logo: PerplexityLogo,
    guide: [
      'Go to perplexity.ai → Settings → API',
      'Generate a new API key',
      'Copy the key (starts with pplx-)',
      'Paste it below and click Test & Connect',
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    tagline: 'Inject AXON memory into your IDE context',
    placeholder: 'sk-...',
    docsUrl: 'https://cursor.sh',
    docsLabel: 'cursor.sh',
    color: '#6366f1',
    bg: 'linear-gradient(135deg, #6366f1, #4f46e5)',
    Logo: CursorLogo,
    guide: [
      'Open Cursor → Settings → Extensions',
      'Find "AXON Memory" and click Configure',
      'Generate an AXON API key from your dashboard',
      'Paste it below and click Test & Connect',
    ],
  },
  {
    id: 'grok',
    name: 'Grok',
    tagline: 'Grok with your memory attached',
    placeholder: 'xai-...',
    docsUrl: 'https://grok.com',
    docsLabel: 'grok.com',
    color: '#4b5563',
    bg: 'linear-gradient(135deg, #4b5563, #1f2937)',
    Logo: GrokLogo,
    guide: [
      'Open Grok → Settings → Connectors',
      'Add a custom connector',
      'Paste your AXON memory endpoint',
      'Approve the OAuth prompt',
    ],
  },
];

// ── Data Source Config (with logos) ─────────────────────────────

export const DATA_SOURCES = [
  {
    id: 'notion',
    name: 'Notion',
    tagline: 'Pages, databases and wikis',
    bg: '#1a1a1a',
    Logo: NotionLogo,
    tokenLabel: 'Internal Integration Token',
    tokenPlaceholder: 'secret_...',
    docsUrl: 'https://www.notion.so/my-integrations',
    docsLabel: 'notion.so/my-integrations',
    canConnect: true,
    guide: [
      'Go to notion.so/my-integrations',
      'Click "+ New integration"',
      'Give it a name, select your workspace',
      'Copy the "Internal Integration Token" (starts with secret_)',
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    tagline: 'Repos, PRs, issues and commits',
    bg: '#24292e',
    Logo: GitHubLogo,
    tokenLabel: 'Personal Access Token',
    tokenPlaceholder: 'ghp_... or github_pat_...',
    docsUrl: 'https://github.com/settings/tokens',
    docsLabel: 'github.com/settings/tokens',
    canConnect: true,
    guide: [
      'Go to github.com → Settings → Developer settings',
      'Personal access tokens → Tokens (classic)',
      'Click "Generate new token (classic)"',
      'Select scopes: repo, read:user — then copy the token',
    ],
  },
  {
    id: 'linear',
    name: 'Linear',
    tagline: 'Issues, projects and roadmaps',
    bg: '#1d1b2e',
    Logo: LinearLogo,
    tokenLabel: 'Linear API Key',
    tokenPlaceholder: 'lin_api_...',
    docsUrl: 'https://linear.app/settings/api',
    docsLabel: 'linear.app/settings/api',
    canConnect: true,
    badge: 'New',
    guide: [
      'Go to linear.app → Settings → API',
      'Click "Create key"',
      'Give it a label and copy the key',
      'Paste it below — key starts with lin_api_',
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    tagline: 'Messages, channels and threads',
    bg: '#4a154b',
    Logo: SlackLogo,
    tokenLabel: 'Bot User OAuth Token',
    tokenPlaceholder: 'xoxb-...',
    docsUrl: 'https://api.slack.com/apps',
    docsLabel: 'api.slack.com/apps',
    canConnect: true,
    guide: [
      'Go to api.slack.com/apps → Create New App',
      'Add OAuth scope: channels:read, messages.read',
      'Install to workspace → copy "Bot User OAuth Token"',
      'Token starts with xoxb-',
    ],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    tagline: 'Emails, threads and contacts',
    bg: '#c5221f',
    Logo: GmailLogo,
    tokenLabel: 'OAuth Access Token',
    tokenPlaceholder: 'ya29...',
    docsUrl: 'https://developers.google.com/gmail/api',
    docsLabel: 'Google Cloud Console',
    canConnect: true,
    guide: [
      'Go to Google Cloud Console → APIs & Services',
      'Enable Gmail API',
      'Create OAuth 2.0 credentials',
      'Use the playground to get an access token',
    ],
  },
  {
    id: 'google_drive',
    name: 'Google Drive',
    tagline: 'Docs, Sheets and Slides',
    bg: '#1a73e8',
    Logo: GoogleDriveLogo,
    canConnect: false,
    badge: 'Soon',
  },
  {
    id: 'apple_notes',
    name: 'Apple Notes',
    tagline: 'Notes and checklists',
    bg: '#2c2c2e',
    Logo: AppleNotesLogo,
    canConnect: false,
    badge: 'Soon',
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    tagline: 'Markdown vault and graph',
    bg: '#2d2b55',
    Logo: ObsidianLogo,
    canConnect: false,
    badge: 'Soon',
  },
];
