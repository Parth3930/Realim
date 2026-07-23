import React, { useEffect, useState } from "react";
import { useBoardStore } from "../../lib/store";
import { useCharacterPhysics } from "./useCharacterPhysics";
import { GameUI } from "./GameUI";

export function CharacterController({
  onFollow,
  broadcast,
}: {
  onFollow?: (x: number, y: number) => void;
  broadcast?: (msg: any) => void;
}) {
  const store = useBoardStore();
  const userId = store.userId;
  const [isPlaying, setIsPlaying] = useState(false);

  // Find my character
  const myCharId = Object.values(store.elements).find(
    (el) => el.type === "character" && el.playerId === userId,
  )?.id;

  // Reset play mode if character is deleted
  useEffect(() => {
    if (!myCharId && isPlaying) {
      setIsPlaying(false);
    }
  }, [myCharId, isPlaying]);

  // Hook handles all the physics, input, collisions, and broadcasting
  useCharacterPhysics({
    isPlaying,
    myCharId,
    onFollow,
    broadcast,
  });

  // Only render UI if user has a character in the board
  const myChar = myCharId ? store.elements[myCharId] : null;
  if (!myChar || myChar.type !== "character") return null;

  return <GameUI isPlaying={isPlaying} setIsPlaying={setIsPlaying} />;
}
