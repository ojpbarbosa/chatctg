import type { Study } from "@cheiron/ctgov";
import { mostRecent } from "../cite";

export const tableRows = (studies: Study[], limit: number): Study[] => mostRecent(studies, limit);
