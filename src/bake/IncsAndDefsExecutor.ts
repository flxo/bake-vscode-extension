import BakeExecutor from '../bake/BakeExecutor';
import BakeExtensionSettings from '../settings/BakeExtensionSettings'
import * as vscode from 'vscode';
import * as path from 'path';
import logger from '../util/logger';

interface IncludesAndDefines {
    includes: string[];
    defines: string[];
}

const WORKSPACE_INCLUDE_PREFIX = '${workspaceRoot}';
const BAKE_ERROR_MESSAGE = 
"Failed to execute bake. This can have many reasons. E.g:\n\
- do you have an up-to-date version of bake installed?\n\
- does your build setup define toolchains with adapts? If so try to setup a build variant in the vscode settings including an adapt property\n\
- are your dependencies in the Project.meta properly defined? Try to invoke bake without --incs-and-defs";

/**
 * Runs bake with --incs-and-defs=json parameter
 * and parses the output privding
 * the includes and defines
 */
class IncsAndDefsExecutor{

    private workspaceFolder: string;

    constructor(workspaceFolder: string){
        this.workspaceFolder = workspaceFolder;
    }

    /**
     * @param project the -m switch value given to bake
     * @param config the config to determine the incs-and-defs for
     * @param adapt and optional adapt string
     * @return Promise resolved with an object {includes: string[], defines: [string] }
     */
    execute(project: string, config: string, adapts: string): Promise<IncludesAndDefines>{
        let configuration = new BakeExtensionSettings()
        let adaptCompiler = configuration.getUnitTestAdaptType()
        let doAdapt = adapts ? `--adapt ${adapts} ` : (config.toLowerCase().includes("unittest") && adaptCompiler)? `--adapt ${adaptCompiler} ` : ""
        let bakeExecutor = new BakeExecutor(this.workspaceFolder);

        logger.info(` Reading bake config for build variant project=${project} config=${config}`);
        return bakeExecutor.execute(`-m ${project} --incs-and-defs=json -a black ${doAdapt}${config}`)
            .then((output) => {
                return this.parseOutput(output);
            }).then((output) => {
                logger.info(` Reading bake config for build variant project=${project} config=${config} done`);
                return output;
            })
            .catch((error) => {
                logger.error(error);
                throw new Error(BAKE_ERROR_MESSAGE);
            });
    }

    private parseOutput(output: string) : Promise<IncludesAndDefines>{
        return new Promise((resolve, reject)=>{
            try {
                let bakeOutputAsObj = JSON.parse(output);
                resolve({
                    includes: this.collectIncludesFrom(bakeOutputAsObj),
                    defines: this.collectDefinesFrom(bakeOutputAsObj)
                });
            } catch (error) {
                logger.error('Failed to parse bake output: ' + error);
                if (output.length == 0){
                    logger.error('=> try to override the bake.config setting');
                } else {
                    logger.error(output);
                }
                reject("failed to parse bake output");
            }
        });
    }

    private collectIncludesFrom(bakeOutput): string[] {
        let collectedIncludes = new Set<string>();
        Object.keys(bakeOutput).forEach((key: string) => {
            let includes = bakeOutput[key].includes;
            let absDir = bakeOutput[key].dir;
            if (!absDir) {
                throw new Error('dir attribute not found in bake output. bake version < 2.42.1? Then run "gem install bake-toolkit"');
            }

            let relativeDir = vscode.workspace.asRelativePath(absDir);

            if (includes) {
                includes.forEach(element => {
                    let include = WORKSPACE_INCLUDE_PREFIX + '/'
                        + path.normalize(path.join(relativeDir, element));
                    collectedIncludes.add(include);
                });
            }
        });
        return [...collectedIncludes];
    }

    private collectDefinesFrom(bakeOutput) : string[]{
        let collectedDefines = new Set<string>();
        Object.keys(bakeOutput).forEach((key: string) => {
            let cDefines = bakeOutput[key].c_defines;
            if (!cDefines) {
                throw new Error('c_defines attribute not found in bake output. bake version < 2.42.1? Then run "gem install bake-toolkit"');
            }

            let cppDefines = bakeOutput[key].cpp_defines;
            if (!cppDefines) {
                throw new Error('cpp_defines attribute not found in bake output. bake version < 2.42.1? Then run "gem install bake-toolkit"');
            }

            cDefines.forEach(element => {
                collectedDefines.add(element);
            });
            cppDefines.forEach(element => {
                collectedDefines.add(element);
            });
        });
        return [...collectedDefines];
    }



}

export default IncsAndDefsExecutor