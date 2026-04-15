import * as Sentry from "@sentry/nextjs";

import { getClientSentryOptions } from "./sentry.shared";

Sentry.init(getClientSentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
