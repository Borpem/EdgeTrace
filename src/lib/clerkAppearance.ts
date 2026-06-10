export const edgeTraceClerkAppearance = {
  variables: {
    colorBackground: "#101010",
    colorText: "#f7f7f3",
    colorTextSecondary: "#b8c7df",
    colorPrimary: "#f7f7f3",
    colorDanger: "#ff5d73",
    colorInputBackground: "#f7f7f3",
    colorInputText: "#050505",
    borderRadius: "0.45rem",
    fontFamily:
      "\"Suisse Int'l\", \"Suisse Intl\", \"Suisse International\", \"Helvetica Neue\", Arial, ui-sans-serif, system-ui, sans-serif"
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full",
    card: "w-full bg-[#101010] border border-white/[0.12] shadow-none text-[#f7f7f3]",
    headerTitle: "text-[#f7f7f3]",
    headerSubtitle: "text-[#b8c7df]",
    socialButtonsBlockButton:
      "border border-white/[0.14] bg-white/[0.06] text-[#f7f7f3] hover:bg-white/[0.1]",
    socialButtonsBlockButtonText: "text-[#f7f7f3] font-semibold",
    dividerLine: "bg-white/[0.12]",
    dividerText: "text-[#8ea0bd]",
    formFieldLabel: "text-[#b8c7df]",
    formFieldLabelRow: "text-[#b8c7df]",
    formFieldInput:
      "border-white/[0.14] bg-[#f7f7f3] text-[#050505] placeholder:text-[#677084] focus:border-[#58d6ff] focus:ring-[#58d6ff]",
    formFieldInputShowPasswordButton: "text-[#677084] hover:text-[#050505]",
    formFieldHintText: "text-[#8ea0bd]",
    formFieldErrorText: "text-[#ff5d73]",
    formButtonPrimary: "bg-[#f7f7f3] text-[#050505] hover:bg-white",
    formResendCodeLink: "text-[#58d6ff]",
    footer: "bg-[#101010] border-t border-white/[0.1]",
    footerAction: "bg-[#101010]",
    footerActionText: "text-[#8ea0bd]",
    footerActionLink: "text-[#f7f7f3] hover:text-[#58d6ff]",
    identityPreviewText: "text-[#f7f7f3]",
    identityPreviewEditButton: "text-[#58d6ff]",
    alert: "border border-[#ffb84d]/40 bg-[#ffb84d]/10",
    alertText: "text-[#ffdfad]"
  }
} as const;
