import { useParams } from "react-router-dom";
import { useStore } from "@/services/store";
import { useEffect } from "react";
import MateriaContent from "@/components/MateriaContent";

export default function Dashboard() {
  const { materiaId } = useParams<{ materiaId: string }>();
  const materias = useStore((s) => s.materias);
  const fetchMaterias = useStore((s) => s.fetchMaterias);
  const setSelectedMateria = useStore((s) => s.setSelectedMateria);
  const fetchMateriaDetalle = useStore((s) => s.fetchMateriaDetalle);

  useEffect(() => {
    if (materias.length === 0) fetchMaterias();
  }, [fetchMaterias, materias.length]);

  // When navigating directly to a materia route, set it
  useEffect(() => {
    if (materiaId) {
      setSelectedMateria(materiaId);
      fetchMateriaDetalle(materiaId);
    }
  }, [materiaId, setSelectedMateria, fetchMateriaDetalle]);

  const materia = materias.find((m) => m.id === materiaId);

  if (!materia) {
    return (
      <MateriaContent />
    );
  }

  return (
    <MateriaContent />
  );
}
