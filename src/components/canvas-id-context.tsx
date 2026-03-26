"use client";

import * as React from "react";

/**
 * Context for scoping group-add-child events to a specific FlowCanvas instance.
 * Prevents multiple canvas instances on one page from cross-contaminating.
 */
export const CanvasIdContext = React.createContext<string | null>(null);
