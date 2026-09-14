import {
  HELP_NAV_ITEMS,
} from "@/lib/gettingStarted/helpCenterCatalog";
import { HELP_NAV_CLASS, HELP_NAV_LINK_CLASS } from "@/lib/gettingStarted/helpCenterPresentation";
import type { HelpCenterCopy } from "@/lib/gettingStarted/helpCenterTopics";

type HelpCenterTopicNavProps = {
  copy: HelpCenterCopy;
};

export function HelpCenterTopicNav({ copy }: HelpCenterTopicNavProps) {
  return (
    <nav className={HELP_NAV_CLASS} aria-label={copy.eyebrow}>
      <ul className="space-y-1">
        {HELP_NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className={HELP_NAV_LINK_CLASS}>
              {copy.nav[item.copyKey]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
