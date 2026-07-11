import { useAppStore } from "../../store/appStore";

function ShowNonCoreCheckbox() {
  const showNonCore = useAppStore((state) => state.showNonCore);
  const toggleShowNonCore = useAppStore((state) => state.toggleShowNonCore);

  return (
    <label className="flex items-center gap-2 text-sm text-white cursor-pointer select-none">
      <input
        type="checkbox"
        checked={showNonCore}
        onChange={() => toggleShowNonCore()}
        className="w-4 h-4 accent-sky-500"
      />
      <span className="font-medium">Show optional dependencies</span>
    </label>
  );
}

export default ShowNonCoreCheckbox;
