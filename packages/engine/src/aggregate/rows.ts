import type { Study } from "@chatctg/ctgov";
import { mostRecent } from "../cite";

export const tableRows = (studies: Study[], limit: number): Study[] => mostRecent(studies, limit);
