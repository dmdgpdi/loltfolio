import type { z } from "zod";
import type { participantSchema } from "./participantSchema";

export type SelectedParticipant = z.infer<typeof participantSchema>;
