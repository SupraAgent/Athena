export type NavItem = {
  label: string;
  href: string;
  icon: string;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "HOME",
    items: [
      { label: "Dashboard", href: "/", icon: "📋" },
    ],
  },
  {
    title: "BUILD",
    items: [
      { label: "Workflow Builder", href: "/builder", icon: "🧩" },
    ],
  },
  {
    title: "BUILDER FORMS",
    items: [
      { label: "Improvement Loop", href: "/improve", icon: "🔄" },
      { label: "Persona Studio", href: "/studio", icon: "🎭" },
      { label: "My Personas", href: "/personas", icon: "👥" },
      { label: "Launch Kit", href: "/launch-kit", icon: "🚀" },
      { label: "Design-to-Ship", href: "/design-to-ship", icon: "🎨" },
      { label: "VibeCode", href: "/vibecode", icon: "⚡" },
      { label: "Auto-Research", href: "/consult", icon: "🔬" },
      { label: "Docs Dashboard", href: "/dashboard", icon: "📚" },
      { label: "Agent Tasks", href: "/agents", icon: "🤖" },
    ],
  },
  {
    title: "CONNECT",
    items: [
      { label: "GitHub Repos", href: "/repos", icon: "📂" },
      { label: "API Keys", href: "/settings", icon: "🔑" },
      { label: "Admin", href: "/settings?tab=admin", icon: "🛡️" },
    ],
  },
];
