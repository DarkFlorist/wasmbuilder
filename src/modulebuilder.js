/*
    Copyright 2019 0KIMS association.

    This file is part of wasmbuilder

    wasmbuilder is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    wasmbuilder is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with wasmbuilder. If not, see <https://www.gnu.org/licenses/>.
*/


const FunctionBuilder = require("./functionbuilder.js");
const utils = require("./utils.js");

class ModuleBuilder {

    constructor() {
        this.functions = [];
        this.functionIdxByName = {};
        this.nImportFunctions = 0;
        this.nInternalFunctions =0;
        this.memory = {
            pagesSize: 1,
            moduleName: "env",
            fieldName: "memory"
        };
        this.free = 8;
        this.datas = [];
        this.modules = {};
        this.exports = [];
    }

    build() {
        this._setSignatures();
        return new Uint8Array([
            ...utils.u32(0x6d736100),
            ...utils.u32(1),
            ...this._buildType(),
            ...this._buildImport(),
            ...this._buildFunctionDeclarations(),
            ...this._buildExports(),
            ...this._buildCode(),
            ...this._buildData()
        ]);
    }

    addFunction(fnName) {
        if (typeof(this.functionIdxByName[fnName]) !== "undefined")
            throw new Error(`Function already defined: ${fnName}`);

        const idx = this.functions.length;
        this.functionIdxByName[fnName] = idx;

        this.functions.push(new FunctionBuilder(this, fnName, "internal"));

        this.nInternalFunctions++;
        return this.functions[idx];
    }

    addIimportFunction(fnName, moduleName, _fieldName) {
        if (typeof(this.functionIdxByName[fnName]) !== "undefined")
            throw new Error(`Function already defined: ${fnName}`);

        if (  (this.functions.length>0)
            &&(this.functions[this.functions.length-1].type == "internal"))
            throw new Error(`Import functions must be declared before internal: ${fnName}`);

        let fieldName = _fieldName || fnName;

        const idx = this.functions.length;
        this.functionIdxByName[fnName] = idx;

        this.functions.push(new FunctionBuilder(this, fnName, "import", moduleName, fieldName));

        this.nImportFunctions ++;
        return this.functions[idx];
    }

    setMemory(pagesSize, moduleName, fieldName) {
        this.memory = {
            pagesSize: pagesSize,
            moduleName: moduleName || "env",
            fieldName: fieldName || "memory"
        };
    }

    exportFunction(fnName, _exportName) {
        const exportName = _exportName || fnName;
        if (typeof(this.functionIdxByName[fnName]) === "undefined")
            throw new Error(`Function not defined: ${fnName}`);
        const idx = this.functionIdxByName[fnName];
        if (exportName != fnName) {
            this.functionIdxByName[exportName] = idx;
        }
        this.exports.push({
            exportName: exportName,
            idx: idx
        });
    }

    addData(offset, bytes) {
        this.datas.push({
            offset: offset,
            bytes: bytes
        });
    }

    alloc(a, b) {
        let size;
        let bytes;
        if (Array.isArray(a) && (typeof(b) === "undefined")) {
            size = a.length;
            bytes = a;
        } else {
            size = a;
            bytes = b;
        }
        const p = this.free;
        this.free += size;
        if (bytes) {
            this.addData(p, bytes);
        }
        return p;
    }

    _setSignatures() {
        this.signatures = [];
        const signatureIdxByName = {};
        for (let i=0; i<this.functions.length; i++) {
            const signature = this.functions[i].getSignature();
            const signatureName = "s_"+utils.toHexString(signature);
            if (typeof(signatureIdxByName[signatureName]) === "undefined") {
                signatureIdxByName[signatureName] = this.signatures.length;
                this.signatures.push(signature);
            }

            this.functions[i].signatureIdx = signatureIdxByName[signatureName];
        }

    }

    _buildSection(sectionType, section) {
        return [sectionType, ...utils.varuint32(section.length), ...section];
    }

    _buildType() {
        return this._buildSection(
            0x01,
            [
                ...utils.varuint32(this.signatures.length),
                ...[].concat(...this.signatures)
            ]
        );
    }

    _buildImport() {
        const entries = [];
        entries.push([
            ...utils.string(this.memory.moduleName),
            ...utils.string(this.memory.fieldName),
            0x02,
            0x00,   //Flags no init valua
            ...utils.varuint32(this.memory.pagesSize)
        ]);
        for (let i=0; i< this.nImportFunctions; i++) {
            entries.push([
                ...utils.string(this.functions[i].moduleName),
                ...utils.string(this.functions[i].fieldName),
                0x00,
                ...utils.varuint32(this.functions[i].signatureIdx)
            ]);
        }
        return this._buildSection(
            0x02,
            utils.varuint32(entries.length).concat(...entries)
        );
    }

    _buildFunctionDeclarations() {
        const entries = [];
        for (let i=this.nImportFunctions; i< this.nInternalFunctions; i++) {
            entries.push(...utils.varuint32(this.functions[i].signatureIdx));
        }
        return this._buildSection(
            0x03,
            [
                ...utils.varuint32(entries.length),
                ...[...entries]
            ]
        );
    }

    _buildExports() {
        const entries = [];
        for (let i=0; i< this.exports.length; i++) {
            entries.push([
                ...utils.string(this.exports[i].exportName),
                0x00,
                ...utils.varuint32(this.exports[i].idx)
            ]);
        }
        return this._buildSection(
            0x07,
            utils.varuint32(entries.length).concat(...entries)
        );
    }

    _buildCode() {
        const entries = [];
        for (let i=this.nImportFunctions; i< this.nInternalFunctions; i++) {
            entries.push(this.functions[i].getBody());
        }
        return this._buildSection(
            0x0a,
            utils.varuint32(entries.length).concat(...entries)
        );
    }

    _buildData() {
        const entries = [];
        entries.push([
            0x00,
            0x41,
            0x00,
            0x0b,
            0x04,
            ...utils.u32(this.free)
        ]);
        for (let i=0; i< this.datas.length; i++) {
            entries.push([
                0x00,
                0x41,
                ...utils.varint32(this.datas[i].offset),
                0x0b,
                ...utils.varuint32(this.datas[i].bytes.length),
                ...this.datas[i].bytes,
            ]);
        }
        return this._buildSection(
            0x0b,
            utils.varuint32(entries.length).concat(...entries)
        );
    }

}

module.exports = ModuleBuilder;
