import type { ModelQuality } from "@/types/processing";

/**
 * The IS-Net ONNX export that replaces the previous IMG.LY runtime. Every
 * download is pinned to one immutable Hugging Face revision and verified
 * against a SHA-256 digest, so a model can never change silently underneath
 * the application.
 */
export const ISNET_MODEL_HOST = "huggingface.co";
export const ISNET_MODEL_REPOSITORY = "onnx-community/ISNet-ONNX";
export const ISNET_MODEL_REVISION = "3fe6e3db3e32c69aadde61fe388ddb1a0574440c";

/** Square side length the IS-Net graph expects for its RGB input. */
export const MODEL_INPUT_SIZE = 1024;
/** Input normalization used by the model card's feature extractor. */
export const MODEL_INPUT_MEAN = 128;
export const MODEL_INPUT_STD = 256;
export const MODEL_INPUT_NAME = "input";
export const MODEL_OUTPUT_NAME = "output";

export interface ModelDescriptor {
	/** Path inside the pinned Hugging Face repository. */
	file: string;
	/** Exact byte length of the pinned file. */
	bytes: number;
	/** SHA-256 of the pinned file, lowercase hex. */
	sha256: string;
}

export const MODEL_DESCRIPTORS: Record<ModelQuality, ModelDescriptor> = {
	isnet_quint8: {
		file: "onnx/model_uint8.onnx",
		bytes: 44_313_990,
		sha256: "bc5108fdc16b0ab3b4ccc70096b411f9309d208b008bca0f9ead3a4c43c90882",
	},
	isnet_fp16: {
		file: "onnx/model_fp16.onnx",
		bytes: 88_116_798,
		sha256: "dffe20331551dcc5d7601563e472448424821f2df41f5bad395848826c5b5be5",
	},
	isnet: {
		file: "onnx/model.onnx",
		bytes: 176_114_856,
		sha256: "8bc7e049e30cdda79a47e111673d3620096993b7c751ca2cb474591c23bfe4b5",
	},
};

export const modelSourceUrl = (model: ModelQuality): string => {
	const descriptor = MODEL_DESCRIPTORS[model];
	return `https://${ISNET_MODEL_HOST}/${ISNET_MODEL_REPOSITORY}/resolve/${ISNET_MODEL_REVISION}/${descriptor.file}`;
};
