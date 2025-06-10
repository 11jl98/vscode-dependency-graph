import { Project } from "ts-morph";
import * as path from "path";

export async function analyzeDependencies(rootPath: string) {
  const project = new Project({
    tsConfigFilePath: path.join(rootPath, "tsconfig.json"),
  });
  const sourceFiles = project.getSourceFiles();
  const nodes: Set<string> = new Set();
  const edgeSet = new Set<string>();
  const edges: { data: { source: string; target: string } }[] = [];

  const inDegrees: Record<string, number> = {};
  const outDegrees: Record<string, number> = {};

  const concreteClasses = new Set<string>();
  const interfaceToImplementations = new Map<string, string[]>();

  const addEdge = (source: string, target: string) => {
    const edgeKey = `${source}->${target}`;
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      edges.push({ data: { source, target } });
      outDegrees[source] = (outDegrees[source] || 0) + 1;
      inDegrees[target] = (inDegrees[target] || 0) + 1;
    }
  };

  sourceFiles.forEach((file) => {
    file.getClasses().forEach((cls) => {
      const className = cls.getName();
      if (className) {
        concreteClasses.add(className);

        cls.getImplements().forEach((impl) => {
          const interfaceName = impl.getExpression().getText();
          if (!interfaceToImplementations.has(interfaceName)) {
            interfaceToImplementations.set(interfaceName, []);
          }
          interfaceToImplementations.get(interfaceName)!.push(className);
        });
      }
    });
  });

  sourceFiles.forEach((file) => {
    file.getClasses().forEach((cls) => {
      const className = cls.getName();
      if (!className) {
        return;
      }
      nodes.add(className);

      cls.getConstructors().forEach((ctor) => {
        ctor.getParameters().forEach((param, index) => {
          const type = param.getType();
          let typeName = type.getSymbol()?.getName();

          const decorators = param.getDecorators();
          const injectDecorator = decorators.find(
            (dec) => dec.getName() === "inject" || dec.getName() === "Inject"
          );

          if (injectDecorator) {
            const args = injectDecorator.getArguments();
            if (args.length > 0) {
              const injectedType = args[0].getText().replace(/['"]/g, "");
              if (concreteClasses.has(injectedType)) {
                typeName = injectedType;
              }
            }
          }

          if (typeName && typeName !== className) {
            const typeSymbol = type.getSymbol();
            const isInterface = typeSymbol
              ?.getDeclarations()
              .some((decl) => decl.getKindName() === "InterfaceDeclaration");

            if (isInterface) {
              const implementations =
                interfaceToImplementations.get(typeName) || [];

              implementations.forEach((implName) => {
                if (concreteClasses.has(implName)) {
                  nodes.add(implName);
                  addEdge(className, implName);
                }
              });
            } else if (concreteClasses.has(typeName)) {
              nodes.add(typeName);
              addEdge(className, typeName);
            }
          }
        });
      });

      cls.getProperties().forEach((prop) => {
        const decorators = prop.getDecorators();
        const injectDecorator = decorators.find(
          (dec) =>
            dec.getName() === "inject" ||
            dec.getName() === "Inject" ||
            dec.getName() === "injectable" ||
            dec.getName() === "Injectable"
        );

        if (injectDecorator) {
          const type = prop.getType();
          let typeName = type.getSymbol()?.getName();

          const args = injectDecorator.getArguments();
          if (args.length > 0) {
            const injectedType = args[0].getText().replace(/['"]/g, "");
            if (concreteClasses.has(injectedType)) {
              typeName = injectedType;
            }
          }

          if (
            typeName &&
            typeName !== className &&
            concreteClasses.has(typeName)
          ) {
            nodes.add(typeName);
            addEdge(className, typeName);
          }
        }
      });
    });
  });

  const nodeArray = Array.from(nodes).map((id) => ({
    data: { id, in: inDegrees[id] || 0, out: outDegrees[id] || 0 },
  }));

  return [...nodeArray, ...edges];
}
