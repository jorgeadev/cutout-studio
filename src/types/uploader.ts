export interface UploaderProps {
	onFiles: (files: File[]) => void;
	disabled?: boolean;
}
