export interface UploaderProps {
	onFiles: (files: File[]) => void;
	onProject: (file: File) => void;
	disabled?: boolean;
}
