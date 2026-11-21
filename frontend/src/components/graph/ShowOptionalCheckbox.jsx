import { useAppStore } from "../../store/appStore";

function ShowOptionalCheckbox() {
  const showOptional = useAppStore((state) => state.showOptional);
  const toggleShowOptional = useAppStore((state) => state.toggleShowOptional);

  return (
    <label className="flex items-center gap-2 text-sm text-white cursor-pointer select-none">
      <input
        type="checkbox"
        checked={showOptional}
        onChange={() => toggleShowOptional()}
        className="w-4 h-4 accent-sky-500"
      />
      <span className="font-medium">Show optional dependencies</span>
    </label>
  );
}

export default ShowOptionalCheckbox;
